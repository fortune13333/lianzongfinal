#!/bin/bash

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo " [ERROR] Virtual environment not found. Run ./setup.sh first."
    exit 1
fi

PORT=$(grep -i "^port" agentv2/config.ini 2>/dev/null | head -1 | awk -F'=' '{print $2}' | tr -d ' \r')
PORT=${PORT:-8001}

echo ""
echo " =========================================="
echo "   ChainTrace starting..."
echo "   Open browser: http://localhost:5173"
echo "   API backend:  http://localhost:$PORT"
echo "   Press Ctrl+C to stop both"
echo " =========================================="
echo ""

# Start frontend in background
npm run dev &
NPM_PID=$!

# Start backend in background
cd agentv2
../.venv/bin/python agent.py &
PYTHON_PID=$!

# Wait and handle Ctrl+C
trap "echo ''; echo 'Stopping...'; kill $NPM_PID $PYTHON_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
