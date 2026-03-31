[图表建议 - 类型: 生成图]
[图表标题: 图2-4 “链踪”后端架构与工作流程示意图]
[图表描述: 绘制一张分层架构图，展示用户请求通过ASGI服务器到达FastAPI应用后，如何在API层（路由）、业务逻辑层（服务）和数据访问层（CRUD）之间流转，并最终与外部依赖（网络设备、AI模型、数据库）交互的完整流程。]

#### **生成代码 (Mermaid)**

```mermaid
%%{init: {'theme': 'neutral', 'fontFamily': 'sans-serif'}}%%
graph TD
    Client[<fa:fa-window-maximize> 用户浏览器]

    subgraph "服务器环境"
        Uvicorn[<fa:fa-server> ASGI服务器 (Uvicorn)]

        subgraph "FastAPI 应用 (分层架构)"
            subgraph "API层 (Routers)"
                ApiRouter["<fa:fa-route> RESTful API Router<br>(api_routes.txt)"]
                WsRouter["<fa:fa-plug> WebSocket Router<br>(websocket_handler.txt)"]
            end

            subgraph "业务逻辑层 (Services)"
                Services["<fa:fa-cogs> <b>服务层</b><br>(services.txt)<br>业务逻辑 / AI集成 / 区块链规则"]
            end

            subgraph "数据访问层 (CRUD)"
                Crud["<fa:fa-database> <b>数据访问层</b><br>(crud.txt)<br>数据库操作"]
            end
        end
    end

    subgraph "外部依赖"
        Devices[<fa:fa-network-wired> 网络设备]
        AI[<fa:fa-robot> Gemini AI]
        DB[(<fa:fa-database> SQLite<br>数据库)]
    end

    Client -- "HTTP / WebSocket<br>请求" --> Uvicorn
    Uvicorn --> ApiRouter
    Uvicorn --> WsRouter

    ApiRouter --> Services
    WsRouter --> Services

    Services -->|调用| Crud
    Services -- "SSH (Netmiko)" --> Devices
    Services -- "API 调用" --> AI
    Crud -- "SQLAlchemy" --> DB
```
