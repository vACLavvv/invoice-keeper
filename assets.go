// Package invoicekeeper embeds the panel (the Next.js export in web/app), Swagger UI and the
// OpenAPI document and the browser extension (served as /extension.zip) into the binary.
package invoicekeeper

import "embed"

//go:embed all:web/app web/swagger docs/openapi.json extension
var Assets embed.FS
