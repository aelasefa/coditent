# Limited human read/write access to CODITENT secrets. Deletion and Vault
# administration are deliberately excluded.
path "secret/data/ft_transcendence" {
  capabilities = ["create", "read", "update", "patch"]
}
path "secret/metadata/ft_transcendence" {
  capabilities = ["list", "read"]
}
