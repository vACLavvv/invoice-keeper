import hashlib
import hmac
import secrets
import re
import threading

# Bound memory use from simultaneous password checks. New hashes use an OWASP
# scrypt configuration; the original v1/v2 format stays readable during upgrades.
_HASH_SLOTS=threading.BoundedSemaphore(2)
_PARAMETERS=(32768,8,3)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    n,r,p=_PARAMETERS
    with _HASH_SLOTS:
        value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=n, r=r, p=p,maxmem=64*1024*1024)
    return f"scrypt${n}${r}${p}${salt}${value.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        parts=encoded.split("$")
        if len(parts)==3 and parts[0]=='scrypt':
            _,salt,expected=parts;n,r,p=16384,8,1
        elif len(parts)==6 and parts[0]=='scrypt':
            _,n,r,p,salt,expected=parts;n,r,p=int(n),int(r),int(p)
            if (n,r,p)!=_PARAMETERS:return False
        else:return False
        if not re.fullmatch(r'[0-9a-f]{32}',salt) or not re.fullmatch(r'[0-9a-f]{128}',expected):return False
        with _HASH_SLOTS:
            actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=n, r=r, p=p,maxmem=64*1024*1024)
        return hmac.compare_digest(actual,bytes.fromhex(expected))
    except (ValueError, TypeError, AttributeError):
        return False


def needs_rehash(encoded):
    return not encoded.startswith('scrypt$32768$8$3$')


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
