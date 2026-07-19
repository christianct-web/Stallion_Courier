"""Generate a PBKDF2 password hash for STALLION_USERS_JSON."""
from __future__ import annotations

import getpass

from app.auth import hash_password


if __name__ == "__main__":
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")
    print(hash_password(password))
