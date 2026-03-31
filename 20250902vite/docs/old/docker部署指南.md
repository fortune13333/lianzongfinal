Docker volume 挂载 chaintrace.db 要求宿主机上这个文件预先存在，否则 Docker 会创建一个同名目录而不是文件。在第一次运行前需要执行一次：


touch agentv2/chaintrace.db   # Linux
# 或 Windows:
type nul > agentv2\chaintrace.db
使用流程：


# 首次构建并启动
docker compose up --build -d

# 查看日志
docker compose logs -f

# 停止
docker compose down

# 代码有改动后重新构建
docker compose up --build -d
浏览器访问 http://localhost:8001，登录页面的代理 API 地址填 http://localhost:8001。

与方案一的对比：

方案一（脚本）	方案二（Docker）
依赖环境	需要安装 Python + Node.js	只需安装 Docker
端口	5173（前端）+ 8001（后端）	8001（一个端口）
数据持久化	直接在项目目录	挂载到宿主机文件
适合场景	本地开发	服务器部署
