#!/usr/bin/env bash
# Auth module E2E verification script

API="http://localhost:3000"

echo "=== TourneePro Auth Module E2E Tests ==="
echo ""

echo "1. Testing login with admin credentials..."
ADMIN_RESPONSE=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stp.fr","password":"admin123"}')
ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ADMIN_TOKEN" ]; then
  echo "✓ Admin login successful"
  echo "  Token: ${ADMIN_TOKEN:0:20}..."
else
  echo "✗ Admin login failed"
  echo "  Response: $ADMIN_RESPONSE"
  exit 1
fi
echo ""

echo "2. Testing GET /auth/me with JWT token..."
ME_RESPONSE=$(curl -s -X GET $API/auth/me \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ME_RESPONSE" | grep -q "admin@stp.fr"; then
  echo "✓ JWT authentication working"
  echo "  User: $(echo $ME_RESPONSE | grep -o '"email":"[^"]*"' | cut -d'"' -f4)"
  echo "  Role: $(echo $ME_RESPONSE | grep -o '"role":"[^"]*"' | cut -d'"' -f4)"
else
  echo "✗ JWT authentication failed"
  echo "  Response: $ME_RESPONSE"
  exit 1
fi
echo ""

echo "3. Testing admin can register new user..."
MANAGER_RESPONSE=$(curl -s -X POST $API/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-manager-'$RANDOM'@stp.fr","password":"password123","role":"MANAGER"}')

if echo "$MANAGER_RESPONSE" | grep -q '"id"'; then
  echo "✓ Admin can register users"
  echo "  Created: $(echo $MANAGER_RESPONSE | grep -o '"email":"[^"]*"' | cut -d'"' -f4)"
else
  echo "✗ Admin registration failed"
  echo "  Response: $MANAGER_RESPONSE"
  exit 1
fi
echo ""

echo "4. Testing unauthorized registration (no token)..."
UNAUTH_RESPONSE=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"hacker@example.com","password":"test","role":"ADMIN"}')

if echo "$UNAUTH_RESPONSE" | grep -q "401"; then
  echo "✓ Unauthorized registration blocked"
else
  echo "✗ Unauthorized registration should be blocked"
  echo "  Response: $UNAUTH_RESPONSE"
  exit 1
fi
echo ""

echo "5. Testing manager login..."
MANAGER_LOGIN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@stp.fr","password":"password123"}')
MANAGER_TOKEN=$(echo $MANAGER_LOGIN | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$MANAGER_TOKEN" ]; then
  echo "✓ Manager login successful"
else
  echo "✗ Manager login failed"
  echo "  Response: $MANAGER_LOGIN"
  exit 1
fi
echo ""

echo "6. Testing manager CANNOT register users (role-based auth)..."
FORBIDDEN_RESPONSE=$(curl -s -X POST $API/auth/register \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@stp.fr","password":"pass123","role":"DRIVER"}')

if echo "$FORBIDDEN_RESPONSE" | grep -q "403"; then
  echo "✓ Role-based authorization working (403 Forbidden)"
else
  echo "✗ Manager should not be able to register users"
  echo "  Response: $FORBIDDEN_RESPONSE"
  exit 1
fi
echo ""

echo "7. Testing invalid credentials..."
INVALID_LOGIN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stp.fr","password":"wrongpassword"}')

if echo "$INVALID_LOGIN" | grep -q "401"; then
  echo "✓ Invalid credentials rejected"
else
  echo "✗ Invalid credentials should be rejected"
  echo "  Response: $INVALID_LOGIN"
  exit 1
fi
echo ""

echo "=== All Auth Tests Passed ✓ ==="
echo ""
echo "Available endpoints:"
echo "  POST /auth/login       - Login with email/password"
echo "  POST /auth/register    - Register new user (ADMIN only)"
echo "  GET  /auth/me          - Get current user (requires JWT)"
echo ""
echo "Swagger docs: http://localhost:3000/api"
