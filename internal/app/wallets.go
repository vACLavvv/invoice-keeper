package app

// Crypto wallet addresses of payees: format and checksum validation for the supported networks.
// BTC — Base58Check (P2PKH, P2SH) and Bech32/Bech32m (SegWit, Taproot); ETH — 0x + 40 hex digits,
// EIP-55 checksum when the address is mixed-case (also USDT/USDC on Ethereum and other EVM chains);
// TRON — Base58Check with version byte 0x41.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"strings"

	"golang.org/x/crypto/sha3"
)

var walletNetworks = []string{"BTC", "ETH", "TRON"}

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58CheckDecode returns the payload without the 4-byte checksum, or nil when invalid.
func base58CheckDecode(s string) []byte {
	if s == "" {
		return nil
	}
	value := new(big.Int)
	radix := big.NewInt(58)
	for _, r := range s {
		index := strings.IndexRune(base58Alphabet, r)
		if index < 0 {
			return nil
		}
		value.Mul(value, radix).Add(value, big.NewInt(int64(index)))
	}
	decoded := value.Bytes()
	for _, r := range s {
		if r != '1' {
			break
		}
		decoded = append([]byte{0}, decoded...)
	}
	if len(decoded) < 5 {
		return nil
	}
	payload, checksum := decoded[:len(decoded)-4], decoded[len(decoded)-4:]
	first := sha256.Sum256(payload)
	second := sha256.Sum256(first[:])
	if !bytes.Equal(second[:4], checksum) {
		return nil
	}
	return payload
}

const bech32Charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

func bech32Polymod(values []byte) uint32 {
	generator := []uint32{0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3}
	checksum := uint32(1)
	for _, v := range values {
		top := checksum >> 25
		checksum = (checksum&0x1ffffff)<<5 ^ uint32(v)
		for i := range 5 {
			if (top>>i)&1 == 1 {
				checksum ^= generator[i]
			}
		}
	}
	return checksum
}

// validSegwit checks a Bech32 (witness v0) or Bech32m (v1+) mainnet address, BIP-173/350.
func validSegwit(address string) bool {
	if strings.ToLower(address) != address && strings.ToUpper(address) != address {
		return false // mixed case is forbidden
	}
	address = strings.ToLower(address)
	separator := strings.LastIndexByte(address, '1')
	if address[:max(separator, 0)] != "bc" || len(address) > 90 || len(address)-separator-1 < 6 {
		return false
	}
	data := make([]byte, 0, len(address)-separator-1)
	for _, r := range address[separator+1:] {
		index := strings.IndexRune(bech32Charset, r)
		if index < 0 {
			return false
		}
		data = append(data, byte(index)) // #nosec G115 -- index < 32: a position in the Bech32 alphabet
	}
	expanded := []byte{3, 3, 0, 2, 3} // "bc" expanded: high bits, 0, low bits
	constant := bech32Polymod(append(expanded, data...))
	values := data[:len(data)-6]
	if len(values) == 0 {
		return false
	}
	version := values[0]
	switch {
	case version == 0 && constant != 1:
		return false
	case version > 0 && constant != 0x2bc830a3:
		return false
	case version > 16:
		return false
	}
	// Regroup 5-bit groups into bytes to check the program length.
	var acc, bits uint
	program := 0
	for _, v := range values[1:] {
		acc = acc<<5 | uint(v)
		bits += 5
		for bits >= 8 {
			bits -= 8
			program++
		}
	}
	if bits >= 5 || acc&((1<<bits)-1) != 0 {
		return false
	}
	if program < 2 || program > 40 {
		return false
	}
	return version != 0 || program == 20 || program == 32
}

func keccakHex(s string) string {
	hash := sha3.NewLegacyKeccak256()
	hash.Write([]byte(s))
	return hex.EncodeToString(hash.Sum(nil))
}

// validEthereum accepts all-lowercase or all-uppercase hex, and mixed case only with a correct EIP-55 checksum.
func validEthereum(address string) bool {
	if len(address) != 42 || !strings.HasPrefix(address, "0x") {
		return false
	}
	digits := address[2:]
	if _, err := hex.DecodeString(digits); err != nil {
		return false
	}
	if digits == strings.ToLower(digits) || digits == strings.ToUpper(digits) {
		return true
	}
	hash := keccakHex(strings.ToLower(digits))
	for i, c := range digits {
		if c >= 'a' && c <= 'f' && hash[i] >= '8' || c >= 'A' && c <= 'F' && hash[i] < '8' {
			return false
		}
	}
	return true
}

// validWallet reports whether the address is a well-formed mainnet address of the network.
func validWallet(network, address string) bool {
	switch network {
	case "BTC":
		if strings.HasPrefix(strings.ToLower(address), "bc1") {
			return validSegwit(address)
		}
		payload := base58CheckDecode(address)
		return len(payload) == 21 && (payload[0] == 0x00 || payload[0] == 0x05)
	case "ETH":
		return validEthereum(address)
	case "TRON":
		payload := base58CheckDecode(address)
		return len(payload) == 21 && payload[0] == 0x41
	}
	return false
}

// walletKey is the comparison form of an address: hex and Bech32 are case-insensitive, Base58 is not.
func walletKey(address string) string {
	address = strings.TrimSpace(address)
	lower := strings.ToLower(address)
	if strings.HasPrefix(lower, "0x") || strings.HasPrefix(lower, "bc1") {
		return lower
	}
	return address
}
