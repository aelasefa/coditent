# Limited human access to the CODITENT secret namespace. No token or policy
# management, auth changes, mount changes, deletion, or root access.
path "secret/data/ft_transcendence" {
  capabilities = ["read"]
}
path "secret/metadata/ft_transcendence" {
  capabilities = ["list", "read"]
}
