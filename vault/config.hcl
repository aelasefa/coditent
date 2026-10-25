# Single-node persistent Vault; host publishing is restricted to loopback.
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}
disable_mlock = false
ui = true
