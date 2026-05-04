#!/usr/bin/env bash
# smoke.sh — ASEL Şantiye Takip production smoke test
#
# Kullanım:
#   bash scripts/smoke.sh <FRONTEND_URL> <WORKER_URL> [JWT]
#
# Örnek:
#   bash scripts/smoke.sh \
#     https://santiye-takipp.pages.dev \
#     https://drive-upload.eng-adtoker.workers.dev \
#     "eyJhbGciOi..."
#
# JWT opsiyonel — verilmezse authenticated test'ler atlanır.
# JWT için: tarayıcıda admin login → DevTools → Application → Local Storage
# → Supabase oturum nesnesinden access_token kopyala.
#
# 7 kritik path test edilir; her test PASS/FAIL renkli yazılır. Exit code:
#   0 → tüm test'ler PASS
#   1 → en az bir test FAIL

set -u

FRONTEND="${1:-}"
WORKER="${2:-}"
JWT="${3:-}"

if [ -z "$FRONTEND" ] || [ -z "$WORKER" ]; then
  echo "Kullanım: bash scripts/smoke.sh <FRONTEND_URL> <WORKER_URL> [JWT]"
  exit 2
fi

# Renkler (TTY değilse bypass)
if [ -t 1 ]; then
  G='\033[0;32m'; R='\033[0;31m'; Y='\033[0;33m'; B='\033[0;34m'; N='\033[0m'
else
  G=''; R=''; Y=''; B=''; N=''
fi

PASS=0
FAIL=0

_test() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf "${G}✓ PASS${N} %s (got %s)\n" "$name" "$actual"
    PASS=$((PASS+1))
  else
    printf "${R}✗ FAIL${N} %s (expected %s, got %s)\n" "$name" "$expected" "$actual"
    FAIL=$((FAIL+1))
  fi
}

_section() {
  printf "\n${B}── %s ──${N}\n" "$1"
}

CURL_OPTS=(-s -o /dev/null -w "%{http_code}" --max-time 15)

# 1) Frontend health
_section "1) Frontend health"
code=$(curl "${CURL_OPTS[@]}" "$FRONTEND/")
_test "GET $FRONTEND/" "200" "$code"

# 2) Worker CORS — izinsiz Origin → Allow-Origin header YOK
_section "2) Worker CORS — izinsiz Origin"
hdrs=$(curl -s -I -X OPTIONS "$WORKER/" \
  -H "Origin: https://attacker.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  --max-time 15 | tr -d '\r' || true)
if echo "$hdrs" | grep -qi "^access-control-allow-origin:"; then
  printf "${R}✗ FAIL${N} CORS — izinsiz Origin'e Allow-Origin yazılmış (sızıntı)\n"
  FAIL=$((FAIL+1))
else
  printf "${G}✓ PASS${N} CORS — izinsiz Origin için Allow-Origin yok\n"
  PASS=$((PASS+1))
fi
if echo "$hdrs" | grep -qi "^vary:.*origin"; then
  printf "${G}✓ PASS${N} CORS — Vary: Origin mevcut (cache poisoning koruması)\n"
  PASS=$((PASS+1))
else
  printf "${Y}△ WARN${N} CORS — Vary: Origin header yok (cache risk)\n"
fi

# 3) Worker CORS — izinli Origin → Allow-Origin yansıtılır
_section "3) Worker CORS — izinli Origin"
hdrs2=$(curl -s -I -X OPTIONS "$WORKER/" \
  -H "Origin: https://santiye-takipp.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  --max-time 15 | tr -d '\r' || true)
if echo "$hdrs2" | grep -qi "^access-control-allow-origin: https://santiye-takipp.pages.dev"; then
  printf "${G}✓ PASS${N} CORS — izinli Origin yansıtıldı\n"
  PASS=$((PASS+1))
else
  printf "${R}✗ FAIL${N} CORS — izinli Origin için Allow-Origin yansımadı\n"
  FAIL=$((FAIL+1))
fi

# 4) Worker /upload — auth yok → 401
_section "4) Worker /upload — unauth"
code=$(curl "${CURL_OPTS[@]}" -X POST "$WORKER/upload" \
  -H "Content-Type: application/json" \
  -d '{}')
_test "POST $WORKER/upload (no auth)" "401" "$code"

# 5) Worker /upload — auth + boş body → 400
_section "5) Worker /upload — auth + invalid body"
if [ -n "$JWT" ]; then
  code=$(curl "${CURL_OPTS[@]}" -X POST "$WORKER/upload" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d '{}')
  _test "POST $WORKER/upload (auth, empty body)" "400" "$code"
else
  printf "${Y}△ SKIP${N} JWT verilmedi\n"
fi

# 6) Worker /misafirLogin — yanlış parola → 401
_section "6) Worker /misafirLogin — yanlış parola"
code=$(curl "${CURL_OPTS[@]}" -X POST "$WORKER/misafirLogin" \
  -H "Content-Type: application/json" \
  -d '{"password":"YANLIS_PAROLA_TEST"}')
_test "POST $WORKER/misafirLogin (wrong)" "401" "$code"

# 7) Worker /maskPII — auth + tek değer
_section "7) Worker /maskPII — auth + 1 value"
if [ -n "$JWT" ]; then
  resp=$(curl -s -X POST "$WORKER/maskPII" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d '{"values":["smoke@test.com"]}' \
    --max-time 15)
  if echo "$resp" | grep -q '"masked":\["pii:[a-f0-9]'; then
    printf "${G}✓ PASS${N} /maskPII döndü pii:<hex> formatında\n"
    PASS=$((PASS+1))
  else
    printf "${R}✗ FAIL${N} /maskPII beklenen format değil: %s\n" "$resp"
    FAIL=$((FAIL+1))
  fi
else
  printf "${Y}△ SKIP${N} JWT verilmedi\n"
fi

# Özet
printf "\n${B}── Özet ──${N}\n"
printf "PASS: %d\n" "$PASS"
printf "FAIL: %d\n" "$FAIL"

if [ "$FAIL" -eq 0 ]; then
  printf "${G}✓ Tüm smoke test'ler geçti.${N}\n"
  exit 0
else
  printf "${R}✗ %d test başarısız.${N}\n" "$FAIL"
  exit 1
fi
