"""Password and opaque session tokens; secrets never enter API records."""

import hashlib
import hmac
import secrets
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import Account, LoginSession, utcnow
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
