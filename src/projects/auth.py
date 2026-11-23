"""Password and opaque session tokens; secrets never enter API records."""

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from projects.config import Settings, valid_proxy_email
from projects.database import Account, EntraIdentity, LoginSession, utcnow
from projects.domain import Problem


class LoginLimiter:
    """Bounded single-process attempt window; proxy peers must be trusted."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.peers: OrderedDict[str, deque[float]] = OrderedDict()
        self.lock = threading.Lock()

    def allowed(self, peer: str) -> bool:
        with self.lock:
            now = self.clock()
            while (
                self.peers and next(iter(self.peers.values()))[-1] <= now - 60
            ):
                self.peers.popitem(last=False)
            if peer not in self.peers:
                if len(self.peers) >= 10000:
                    return False
                self.peers[peer] = deque()
            attempts = self.peers[peer]
            while attempts and attempts[0] <= now - 60:
                attempts.popleft()
            if len(attempts) >= 10:
                return False
            attempts.append(now)
            self.peers.move_to_end(peer)
            return True


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        600000,
    ).hex()
    return f"pbkdf2_sha256$600000${salt}${digest}"


def password_matches(password: str, encoded: str) -> bool:
    algorithm, rounds, salt, digest = encoded.split("$")
    if algorithm != "pbkdf2_sha256":
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        int(rounds),
    ).hex()
    return hmac.compare_digest(actual, digest)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate(db: Session, username: str, password: str) -> Account:
    user = db.scalar(
        select(Account).where(Account.username == username.lower())
    )
    if user is None:
        # Equalize the expensive password work for existing and missing users.
        password_hash(password)
        raise Problem(401, "계정 또는 비밀번호를 확인해 주세요.")
    if not password_matches(password, user.password_hash):
        raise Problem(401, "계정 또는 비밀번호를 확인해 주세요.")
    return user


def authenticate_proxy(
    db: Session,
    settings: Settings,
    email: str,
    subject: str,
    tenant_id: str = "",
    issuer: str = "",
) -> Account:
    email = email.strip().lower()
    if not settings.proxy_auth_enabled or not valid_proxy_email(email):
        raise Problem(401, "Microsoft 로그인이 필요합니다.")
    if settings.proxy_auth_policy is not None:
        return authenticate_entra_identity(
            db, settings, email, subject, tenant_id, issuer
        )
    if not settings.proxy_auth_domain:
        if not hmac.compare_digest(email, settings.proxy_auth_email):
            raise Problem(401, "Microsoft 로그인이 필요합니다.")
        user = db.scalar(
            select(Account).where(
                Account.username == settings.proxy_auth_username
            )
        )
        if user is None:
            raise Problem(401, "허용된 Projects 계정이 없습니다.")
        return user

    # The single-tenant proxy validates the issuer and supplies the OIDC sub.
    # Email selects eligibility only; it never merges organization accounts.
    if email.rsplit("@", 1)[
        1
    ] != settings.proxy_auth_domain or not re.fullmatch(
        r"[A-Za-z0-9_-]{1,255}", subject
    ):
        raise Problem(401, "Microsoft 로그인이 필요합니다.")
    user = db.scalar(select(Account).where(Account.entra_subject == subject))
    if user is not None:
        return user
    if email == settings.proxy_auth_email:
        user = db.scalar(
            select(Account)
            .where(Account.username == settings.proxy_auth_username)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if user is None or user.entra_subject not in (None, subject):
            raise Problem(401, "허용된 Projects 계정이 없습니다.")
        user.entra_subject = subject
        db.flush()
        return user

    # ON CONFLICT makes concurrent first logins converge on one account.
    # A reused email or a local username never takes over another account.
    fallback = "entra-" + hashlib.sha256(subject.encode()).hexdigest()
    encoded = password_hash(secrets.token_urlsafe(32))
    usernames = [email, fallback] if len(email) <= 80 else [fallback]
    for username in usernames:
        db.execute(
            insert(Account)
            .values(
                username=username, password_hash=encoded, entra_subject=subject
            )
            .on_conflict_do_nothing()
        )
        user = db.scalar(
            select(Account).where(Account.entra_subject == subject)
        )
        if user is not None:
            return user
    raise Problem(401, "Projects 계정을 연결할 수 없습니다.")


def authenticate_entra_identity(
    db: Session,
    settings: Settings,
    email: str,
    subject: str,
    tenant_id: str,
    issuer: str,
) -> Account:
    """Use proxy-verified issuer+subject; login eligibility never grants sharing."""
    policy = settings.proxy_auth_policy
    assert policy is not None
    tenant = next((row for row in policy.tenants if row.id == tenant_id), None)
    if (
        tenant is None
        or issuer != f"https://login.microsoftonline.com/{tenant_id}/v2.0"
        or email.rsplit("@", 1)[1] not in tenant.email_domains
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", subject)
    ):
        raise Problem(401, "허용된 Microsoft 조직 계정으로 로그인해 주세요.")

    identity = db.get(EntraIdentity, (tenant_id, subject))
    if identity is not None:
        account = db.get(Account, identity.account_id)
        assert account is not None
        return account

    # A transaction-scoped lock makes identical first logins converge before
    # provisioning. Username collisions across tenants still use ON CONFLICT.
    key = hashlib.sha256(f"{tenant_id}:{subject}".encode()).digest()
    db.execute(
        select(
            func.pg_advisory_xact_lock(int.from_bytes(key[:8], signed=True))
        )
    )
    identity = db.get(EntraIdentity, (tenant_id, subject))
    if identity is not None:
        account = db.get(Account, identity.account_id)
        assert account is not None
        return account

    account = None
    if tenant_id == policy.legacy_tenant_id:
        account = db.scalar(
            select(Account)
            .where(Account.entra_subject == subject)
            .with_for_update()
        )
        if account is None and email == settings.proxy_auth_email:
            account = db.scalar(
                select(Account)
                .where(Account.username == settings.proxy_auth_username)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if account is None or account.entra_subject not in (None, subject):
                raise Problem(401, "허용된 Projects 계정이 없습니다.")
            account.entra_subject = subject
        if account is not None:
            # Only the original issuer can claim legacy subject bindings.
            bound = db.scalar(
                select(EntraIdentity).where(
                    EntraIdentity.account_id == account.id
                )
            )
            if bound is not None:
                raise Problem(401, "Projects 계정을 연결할 수 없습니다.")
    if account is None:
        fallback = "entra-" + key.hex()
        usernames = [email, fallback] if len(email) <= 80 else [fallback]
        encoded = password_hash(secrets.token_urlsafe(32))
        for username in usernames:
            account_id = db.scalar(
                insert(Account)
                .values(username=username, password_hash=encoded)
                .on_conflict_do_nothing()
                .returning(Account.id)
            )
            if account_id is not None:
                account = db.get(Account, account_id)
                break
    if account is None:
        raise Problem(401, "Projects 계정을 연결할 수 없습니다.")
    db.add(
        EntraIdentity(
            tenant_id=tenant_id, subject=subject, account_id=account.id
        )
    )
    db.flush()
    return account


def create_session(
    db: Session,
    user: Account,
    duration: int,
) -> tuple[str, LoginSession]:
    token = secrets.token_urlsafe(32)
    session = LoginSession(
        token_hash=token_hash(token),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=utcnow() + timedelta(seconds=duration),
    )
    db.add(session)
    db.flush()
    return token, session


def resolve_session(db: Session, token: str | None) -> LoginSession:
    if not token:
        raise Problem(401, "로그인이 필요합니다.")
    session = db.get(LoginSession, token_hash(token))
    if session is None or session.expires_at <= utcnow():
        raise Problem(401, "세션이 만료되었습니다. 다시 로그인해 주세요.")
    return session
