"""
Prototype user store.

Keeps signup/login usable without requiring PostGIS for auth during local demos.
"""
import json
import os
from pathlib import Path
from threading import RLock
from typing import Dict, Optional

from backend.auth.jwt_handler import get_password_hash


UserRecord = Dict[str, str]

DEFAULT_USERS: Dict[str, UserRecord] = {
    "admin": {"username": "admin", "password": get_password_hash("aurora2026"), "role": "admin"},
    "responder_01": {"username": "responder_01", "password": get_password_hash("rescue_now"), "role": "responder"},
    "citizen_demo": {"username": "citizen_demo", "password": get_password_hash("safety_first"), "role": "citizen"},
}

USERS_FILE = Path(os.getenv("AURORA_USERS_FILE", "backend/.data/users.json"))
_lock = RLock()
_users: Dict[str, UserRecord] = {}


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def _load_users() -> Dict[str, UserRecord]:
    if not USERS_FILE.exists():
        return dict(DEFAULT_USERS)

    with USERS_FILE.open("r", encoding="utf-8") as f:
        users = json.load(f)

    merged = dict(DEFAULT_USERS)
    merged.update(users)
    return merged


def _save_users() -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    custom_users = {k: v for k, v in _users.items() if k not in DEFAULT_USERS}
    with USERS_FILE.open("w", encoding="utf-8") as f:
        json.dump(custom_users, f, indent=2)


def get_user(username: str) -> Optional[UserRecord]:
    with _lock:
        return _users.get(_normalize_username(username))


def create_user(username: str, password: str, role: str = "citizen") -> UserRecord:
    username = _normalize_username(username)
    role = role.strip().lower()

    if not username:
        raise ValueError("Username is required")
    if not password:
        raise ValueError("Password is required")
    if role not in {"admin", "responder", "citizen"}:
        raise ValueError("Role must be admin, responder, or citizen")

    with _lock:
        if username in _users:
            raise KeyError("Username already registered")

        user = {
            "username": username,
            "password": get_password_hash(password),
            "role": role,
        }
        _users[username] = user
        _save_users()
        return user


_users = _load_users()