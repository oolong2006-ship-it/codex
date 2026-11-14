"""Controller protocol and the trivial no-op controller."""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Controller(Protocol):
    """A signal controller. ``conn`` is the libsumo module (TraCI-compatible API).

    ``setup`` is called once after the simulation starts (before the first step) with
    the traffic-light ids ordered south -> north; ``step`` is called every simulated
    second after the simulation advanced to time ``t`` (1, 2, ...).
    """

    name: str
    label_ar: str

    def setup(self, conn: Any, tls_ids: list[str]) -> None: ...

    def step(self, conn: Any, t: int) -> None: ...


class StaticProgram:
    """Leaves SUMO's own static programs (from netconvert) running. Test/reference only."""

    name = "static"
    label_ar = "البرنامج الافتراضي"

    def setup(self, conn: Any, tls_ids: list[str]) -> None:
        pass

    def step(self, conn: Any, t: int) -> None:
        pass
