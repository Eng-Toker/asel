#!/usr/bin/env bash
# smoke.sh — ASEL Şantiye Takip production smoke test
#
# Kullanım:
#   bash scripts/smoke.sh <FRONTEND_URL> <WORKER_URL> <SUPABASE_URL> <SUPABASE_ANON_KEY> [JWT]
#
# Örnek:
#   bash scripts/smoke.sh \
#     https://santiye-takipp.pages.dev \
#     https://drive-upload.eng-adtoker.workers.dev \
#     https://ecassmluvjskywibbkuv.supabase.co \
#     "eyJhbGciOiJI...anon-key..." \
#     "eyJhbGciOi...user-jwt..."
#
# JWT opsiyonel — verilmezse authenticated test'ler atlanır.
# JWT için: tarayıcıda admin login → DevTools → Application → Local Storage
# → Supabase oturum nesnesinden access_token kopyala.
# WS test (10) için node binary gerek; yoksa skip.
#
# 10 kritik path test edilir; her test PASS/FAIL renkli yazılır. Exit code:
#   0 → tüm test'ler PASS
#   1 → en az bir test FAIL

set -u

FRONTEND="${1:-}"
WORKER="${2:-}"
SUPABASE_URL="${3:-}"
SUPABASE_KEY="${4:-}"
JWT="${5:-}"

if [ -z "$FRONTEND" ] || [ -z "$WORKER" ] || [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Kullanım: bash scripts/smoke.sh <FRONTEND_URL> <WORKER_URL> <SUPABASE_URL> <SUPABASE_ANON_KEY> [JWT]"
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

# 8) RLS sanity — anon JWT ile santiye_raporlar SELECT (P1-6)
# Beklenen davranışlar (her biri PASS):
#   - 200 + boş array  → rap_select using filter false (authenticated only)
#   - 401              → anon JWT reddedildi
#   - 403              → RLS deny
# FAIL kriteri:
#   - 200 + non-empty array → RLS sızıntısı (anon veri görüyor!)
#   - 5xx                   → backend hatası
_section "8) RLS sanity — anon SELECT santiye_raporlar"
resp=$(curl -s -w "\n%{http_code}" \
  "$SUPABASE_URL/rest/v1/santiye_raporlar?select=id&limit=1" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  --max-time 15)
body=$(echo "$resp" | sed '$d')
code=$(echo "$resp" | tail -n1)
case "$code" in
  200)
    if [ "$body" = "[]" ]; then
      printf "${G}✓ PASS${N} RLS — anon SELECT 200 + boş array\n"
      PASS=$((PASS+1))
    else
      printf "${R}✗ FAIL${N} RLS SIZINTISI — anon SELECT 200 + non-empty: %s\n" "$body"
      FAIL=$((FAIL+1))
    fi
    ;;
  401|403)
    printf "${G}✓ PASS${N} RLS — anon SELECT %s (deny)\n" "$code"
    PASS=$((PASS+1))
    ;;
  *)
    printf "${R}✗ FAIL${N} RLS — beklenmeyen kod %s body: %s\n" "$code" "$body"
    FAIL=$((FAIL+1))
    ;;
esac

# 9) CORS keskin reject — actual POST + malicious Origin
# Browser preflight'tan sonra actual istek; izinsiz Origin için
# Allow-Origin yok → browser bloklar (sunucu yine de cevaplayabilir).
_section "9) CORS — actual POST + malicious Origin"
hdrs=$(curl -s -I -X POST "$WORKER/upload" \
  -H "Origin: https://attacker.example.com" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 15 | tr -d '\r' || true)
if echo "$hdrs" | grep -qi "^access-control-allow-origin: https://attacker"; then
  printf "${R}✗ FAIL${N} CORS — actual POST'ta attacker Origin yansıdı\n"
  FAIL=$((FAIL+1))
else
  printf "${G}✓ PASS${N} CORS — actual POST'ta Allow-Origin yansımadı\n"
  PASS=$((PASS+1))
fi

# 10) WebSocket connect + 30s heartbeat (Supabase Realtime)
# Önkoşullar:
#   - node binary
#   - npm 'ws' paketi (resolve precheck ile doğrulanır; yoksa SKIP+öneri)
# Phoenix protocol heartbeat: 30s içinde ws.onopen + heartbeat ack PASS.
_section "10) WS connect + 30s heartbeat"
if ! command -v node >/dev/null 2>&1; then
  printf "${Y}△ SKIP${N} WS — node binary yok\n"
elif ! node -e "require.resolve('ws')" >/dev/null 2>&1; then
  printf "${Y}△ SKIP${N} WS — 'ws' paketi resolve edilemedi (npm i -g ws veya yerel npm i ws)\n"
else
  WS_URL="${SUPABASE_URL/https:\/\//wss://}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0"
  NODE_RESULT=$(WS_URL="$WS_URL" node -e '
    const WebSocket = require("ws");
    const ws = new WebSocket(process.env.WS_URL);
    let opened = false, hbAcked = false;
    const t = setTimeout(() => {
      console.log(JSON.stringify({opened, hbAcked, reason: "timeout"}));
      try { ws.terminate(); } catch {}
      process.exit(0);
    }, 35000);
    ws.on("open", () => {
      opened = true;
      ws.send(JSON.stringify({topic:"phoenix", event:"heartbeat", payload:{}, ref:"smoke-1"}));
    });
    ws.on("message", (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m.ref === "smoke-1" && m.event === "phx_reply") {
          hbAcked = true;
          clearTimeout(t);
          console.log(JSON.stringify({opened, hbAcked, reason: "ack"}));
          try { ws.close(); } catch {}
          process.exit(0);
        }
      } catch {}
    });
    ws.on("error", (e) => {
      console.log(JSON.stringify({opened, hbAcked, reason: "error: " + e.message}));
      clearTimeout(t);
      process.exit(0);
    });
  ' 2>&1)
  if echo "$NODE_RESULT" | grep -q '"hbAcked":true'; then
    printf "${G}✓ PASS${N} WS — open + heartbeat ack\n"
    PASS=$((PASS+1))
  else
    printf "${R}✗ FAIL${N} WS — %s\n" "$NODE_RESULT"
    FAIL=$((FAIL+1))
  fi
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
