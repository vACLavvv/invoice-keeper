package notify

import (
	"math"
	"math/rand/v2"
	"time"
)

// RetryDelay uses bounded exponential backoff with positive jitter. The remote
// Retry-After is a minimum, never shortened, even when it exceeds the local cap.
// Only a transport's explicit pending result may enter this policy.
func RetryDelay(attempt, remoteMinimum int) int {
	base := 60 << min(max(attempt-1, 0), 6)
	base = min(base, 3600)
	jitter := rand.IntN(base/4 + 1) // #nosec G404 -- non-security scheduling jitter
	return max(remoteMinimum, min(3600, base+jitter))
}

func nextRetryAt(state string, delay int) int64 {
	if state != "pending" {
		return 0
	}
	return retryDeadline(delay)
}

func retryDeadline(delay int) int64 {
	now := time.Now().Unix()
	if int64(delay) > math.MaxInt64-now {
		return math.MaxInt64
	}
	return now + int64(max(1, delay))
}
