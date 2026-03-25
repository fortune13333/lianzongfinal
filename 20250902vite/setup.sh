#!/bin/bash
set -e

echo ""
echo " =========================================="
echo "   链踪 ChainTrace | 首次安装向导"
echo " =========================================="
echo ""

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo " [错误] 未检测到 Python3，请先安装 Python 3.10 或更高版本。"
    echo "        Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
    echo "        CentOS/RHEL:   sudo yum install python3"
    exit 1
fi
echo " [OK] 检测到 $(python3 --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo " [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。"
    echo "        推荐使用 nvm: https://github.com/nvm-sh/nvm"
    exit 1
fi
echo " [OK] 检测到 Node.js $(node --version)"

echo ""
echo " [1/4] 创建 Python 虚拟环境..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "       完成。"
else
    echo "       已存在，跳过。"
fi

echo " [2/4] 安装 Python 依赖包..."
.venv/bin/pip install -r agentv2/requirements.txt -q
echo "       完成。"

echo " [3/4] 安装前端依赖包 (npm install)..."
npm install --silent
echo "       完成。"

echo " [4/4] 构建前端 (npm run build)..."
npm run build
echo "       完成。"

# 赋予 start.sh 执行权限
chmod +x start.sh

echo ""
echo " =========================================="
echo "   安装成功！请运行 ./start.sh 启动程序。"
echo " =========================================="
echo ""
