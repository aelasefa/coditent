# Limited human read/write access to CODITENT secrets. Deletion and Vault
# administration are deliberately excluded.
path "secret/data/coditent" {
  capabilities = ["create", "read", "update", "patch"]
}
path "secret/metadata/coditent" {
  capabilities = ["list", "read"]
}
