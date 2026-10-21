import asyncio

import pytest


def test_runner_closes_when_application_context_fails(app):
    async def exercise():
        async with app.router.lifespan_context(app):
            raise RuntimeError("synthetic context failure")

    with pytest.raises(RuntimeError, match="synthetic context failure"):
        asyncio.run(exercise())
    assert app.state.runner.closed is True
