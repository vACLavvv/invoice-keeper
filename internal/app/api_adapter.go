package app

// apiAdapter implements the ServerInterface generated from docs/openapi.json (internal/api):
// one method per documented operation, each calling its handler. An operation added to the spec
// without a handler here does not compile. Path and query parameters are also parsed by the
// handlers themselves, so the typed values from the generated wrapper are not used.

import (
	"net/http"

	"invoice-keeper/internal/api"
)

type apiAdapter struct{ s *Server }

var _ api.ServerInterface = apiAdapter{}

func (a apiAdapter) Login(w http.ResponseWriter, r *http.Request) { a.s.serveAPI(w, r, a.s.login) }

func (a apiAdapter) Me(w http.ResponseWriter, r *http.Request) { a.s.serveAPI(w, r, a.s.me) }

func (a apiAdapter) Logout(w http.ResponseWriter, r *http.Request) { a.s.serveAPI(w, r, a.s.logout) }

func (a apiAdapter) ChangePassword(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.changePassword)
}

func (a apiAdapter) TwoFactorStatus(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.twoFactorStatus)
}

func (a apiAdapter) TwoFactorSetup(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.twoFactorSetup)
}

func (a apiAdapter) TwoFactorEnable(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.twoFactorEnable)
}

func (a apiAdapter) TwoFactorDisable(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.twoFactorDisable)
}

func (a apiAdapter) MyTelegram(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.myTelegram)
}

func (a apiAdapter) UnlinkTelegram(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.myTelegramUnlink)
}

func (a apiAdapter) TelegramLinkCode(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.myTelegramLinkCode)
}

func (a apiAdapter) ListRecurringPayments(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.recurringList)
}

func (a apiAdapter) CreateRecurringPayment(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.recurringCreate)
}

func (a apiAdapter) UpdateRecurringPayment(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.recurringUpdate)
}

func (a apiAdapter) ArchiveRecurringPayment(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.recurringDelete)
}

func (a apiAdapter) PauseRecurringPayment(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.recurringPause)
}

func (a apiAdapter) ResumeRecurringPayment(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.recurringResume)
}

func (a apiAdapter) ImportRecurringPayments(w http.ResponseWriter, r *http.Request, _ api.ImportRecurringPaymentsParams) {
	a.s.serveAPI(w, r, a.s.recurringImport)
}

func (a apiAdapter) ImportTemplate(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.importTemplate)
}

func (a apiAdapter) ExportOccurrences(w http.ResponseWriter, r *http.Request, _ api.ExportOccurrencesParams) {
	a.s.serveAPI(w, r, a.s.occurrencesExport)
}

func (a apiAdapter) ListReceipts(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.receiptsList)
}

func (a apiAdapter) AddReceipt(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.receiptsAdd)
}

func (a apiAdapter) DownloadReceipt(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.receiptFile)
}

func (a apiAdapter) DeleteReceipt(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.receiptsDelete)
}

func (a apiAdapter) Budget(w http.ResponseWriter, r *http.Request, _ api.BudgetParams) {
	a.s.serveAPI(w, r, a.s.budget)
}

func (a apiAdapter) ListOccurrences(w http.ResponseWriter, r *http.Request, _ api.ListOccurrencesParams) {
	a.s.serveAPI(w, r, a.s.occurrenceList)
}

func (a apiAdapter) GetOccurrence(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.occurrenceGet)
}

func (a apiAdapter) UpdateOccurrence(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.occurrenceUpdate)
}

func (a apiAdapter) PaymentsSummary(w http.ResponseWriter, r *http.Request, _ api.PaymentsSummaryParams) {
	a.s.serveAPI(w, r, a.s.summary)
}

func (a apiAdapter) ListUsers(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.usersList)
}

func (a apiAdapter) CreateUser(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.usersCreate)
}

func (a apiAdapter) UpdateUser(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.usersUpdate)
}

func (a apiAdapter) DeleteUser(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.usersDelete)
}

func (a apiAdapter) Settings(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.appSettings)
}

func (a apiAdapter) ListReminders(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.remindersList)
}

func (a apiAdapter) AuditLog(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.auditList)
}

func (a apiAdapter) ListApiKeys(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.apiKeysList)
}

func (a apiAdapter) CreateApiKey(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.apiKeysCreate)
}

func (a apiAdapter) DeleteApiKey(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.apiKeysDelete)
}

func (a apiAdapter) ExtensionWhoami(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.extensionWhoami)
}

func (a apiAdapter) SubmitSuggestion(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.suggestionsSubmit)
}

func (a apiAdapter) ListSuggestions(w http.ResponseWriter, r *http.Request, _ api.ListSuggestionsParams) {
	a.s.serveAPI(w, r, a.s.suggestionsList)
}

func (a apiAdapter) AcceptSuggestion(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.suggestionsAccept)
}

func (a apiAdapter) RejectSuggestion(w http.ResponseWriter, r *http.Request, _ int) {
	a.s.serveAPI(w, r, a.s.suggestionsReject)
}

func (a apiAdapter) Health(w http.ResponseWriter, r *http.Request) { a.s.serveAPI(w, r, a.s.health) }

func (a apiAdapter) ListSessions(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.sessionsList)
}

func (a apiAdapter) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.sessionsDeleteOthers)
}

func (a apiAdapter) RevokeSession(w http.ResponseWriter, r *http.Request, _ string) {
	a.s.serveAPI(w, r, a.s.sessionsDelete)
}

func (a apiAdapter) ListDeliveries(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.deliveriesList)
}

func (a apiAdapter) SanctionsStatus(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.sanctionsGet)
}

func (a apiAdapter) SanctionsRefresh(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.sanctionsRefresh)
}

func (a apiAdapter) SanctionsCheck(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.sanctionsCheck)
}

func (a apiAdapter) VerifyAuditLog(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.auditVerify)
}

func (a apiAdapter) ConfirmPairing(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.pairingsCreate)
}

func (a apiAdapter) ClaimPairing(w http.ResponseWriter, r *http.Request) {
	a.s.serveAPI(w, r, a.s.pairingsClaim)
}
