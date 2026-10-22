# Limited human access to the CODITENT secret namespace. No token or policy
# management, auth changes, mount changes, deletion, or root access.
path "secret/data/coditent" {
  capabilities = ["read"]
}
path "secret/metadata/coditent" {
  capabilities = ["list", "read"]
}
