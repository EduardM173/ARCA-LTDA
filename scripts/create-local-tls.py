"""Generate a local test certificate without modifying any Windows trust store."""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

folder = Path('.runtime/tls')
folder.mkdir(parents=True, exist_ok=True)
cert_path, key_path = folder / 'cert.pem', folder / 'key.pem'
if cert_path.exists() or key_path.exists():
    if not cert_path.exists() or not key_path.exists():
        raise SystemExit('Incomplete local TLS pair; existing files were preserved.')
    existing = x509.load_pem_x509_certificate(cert_path.read_bytes())
    existing_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    if existing.public_key().public_numbers() != existing_key.public_key().public_numbers():
        raise SystemExit('Local TLS key does not match certificate; files were preserved.')
    if existing.not_valid_after_utc <= datetime.now(timezone.utc):
        raise SystemExit('Local TLS certificate expired; files were preserved.')
    print('Reusing the matching, unexpired local TLS pair. No trust store was changed.')
    raise SystemExit(0)
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
now = datetime.now(timezone.utc)
certificate = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
    .public_key(key.public_key()).serial_number(x509.random_serial_number())
    .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=7))
    .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),
        x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), critical=False)
    .sign(key, hashes.SHA256()))
with key_path.open('xb') as stream:
    stream.write(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
key_path.chmod(0o600)
cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
print('Created a seven-day localhost certificate in .runtime/tls. No trust store was changed.')
