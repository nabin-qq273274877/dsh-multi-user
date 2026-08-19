#!/bin/sh
# dsh-multi-user 端到端测试（在容器内运行，需 dsh web 已启动于 127.0.0.1:3080）
# 覆盖：登录墙 → 初始化 → 登录 → JWT → 用户管理 → 权限边界 → 分档
set -e
BASE=http://127.0.0.1:3080

echo "=== 1. 未登录访问 /（应返回初始化页或登录页） ==="
curl -s "$BASE/" | grep -o '<title>[^<]*</title>'

echo ""
echo "=== 2. 初始化主管理员（若 fresh） ==="
STATE=$(curl -s "$BASE/api/mu/public/config")
echo "状态: $STATE"
if echo "$STATE" | grep -q '"state":"fresh"'; then
  curl -s -X POST "$BASE/api/mu/admin/owner" -H 'content-type: application/json' \
    -d '{"username":"alice","password":"secret123"}' -w "\nHTTP %{http_code}\n"
fi

echo ""
echo "=== 3. 登录 ==="
A_JAR=/tmp/mu-test-a.txt; rm -f "$A_JAR"
curl -s -c "$A_JAR" -X POST "$BASE/api/mu/auth/password" -H 'content-type: application/json' \
  -d '{"username":"alice","password":"secret123"}' -w "\nHTTP %{http_code}\n"

echo ""
echo "=== 4. 带 cookie 访问 /（应返回 DSH index） ==="
curl -s -b "$A_JAR" "$BASE/" -o /tmp/mu-index.html -w "HTTP %{http_code}\n"
grep -o '<title>[^<]*</title>' /tmp/mu-index.html | head -1

echo ""
echo "=== 5. me/grants（应含 userId + role） ==="
curl -s -b "$A_JAR" "$BASE/api/mu/me/grants" -w "\nHTTP %{http_code}\n"

echo ""
echo "=== 6. 新建子用户 ==="
curl -s -b "$A_JAR" -X POST "$BASE/api/mu/admin/users" -H 'content-type: application/json' \
  -d '{"username":"bob","initialPassword":"bobpass123","workspaceDirs":["/tmp/ws-bob"]}' -w "\nHTTP %{http_code}\n"

echo ""
echo "=== 7. 未登录访问 me/grants（应 401） ==="
curl -s "$BASE/api/mu/me/grants" -w "\nHTTP %{http_code}\n"
