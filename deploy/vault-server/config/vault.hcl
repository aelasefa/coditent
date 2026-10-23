ui = true
disable_mlock = true

# Vault reads api_addr directly from VAULT_API_ADDR in its environment.

storage "file" {
  path = "/vault/file"
}

# Listener configuration:
# TLS is disabled here because all Vault traffic is strictly restricted
# to the private Tailscale network interface (${TAILSCALE_IP}:8200).
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true

  # Optional TLS configuration for future end-to-end encryption within Tailscale:
  # tls_disable = false
  # tls_cert_file = "/vault/config/tls/vault.crt"
  # tls_key_file  = "/vault/config/tls/vault.key"
}
