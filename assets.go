// Package invoicekeeper embeds the panel (the Next.js export in web/app), Swagger UI and the
// OpenAPI document into the binary.
package invoicekeeper

import "embed"

//go:embed all:web/app web/swagger docs/openapi.json
var Assets embed.FS
