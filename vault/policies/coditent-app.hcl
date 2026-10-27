# Runtime services may only read the application's shared KV v2 document.
path "secret/data/ft_transcendence" {
  capabilities = ["read"]
}
