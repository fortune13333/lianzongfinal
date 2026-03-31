[图表建议 - 类型: 生成图]
[图表标题: 图3-5 系统数据库实体-关系图 (E-R Diagram)]
[图表描述: 使用更清晰的流程图语法重新绘制E-R图，以明确展示各实体及其关键属性，并通过带基数（Cardinality）说明的连接线来详细阐述实体间的“一对多”和“多对多”关系。]

#### **生成代码 (Mermaid)**

```mermaid
%%{init: {'theme': 'neutral', 'fontFamily': 'sans-serif'}}%%
graph LR
    %% --- Entity Definitions (数据实体定义) ---
    USER("
        <b>USER (用户)</b>
        <hr>
        id (PK)
        <br>username
        <br>role
        <br>extra_permissions
    ")
    DEVICE("
        <b>DEVICE (设备)</b>
        <hr>
        id (PK)
        <br>name
        <br>ipAddress
        <br>type
    ")
    BLOCK("
        <b>BLOCK (区块)</b>
        <hr>
        id (PK)
        <br>device_id (FK)
        <br>index
        <br>hash
        <br>...
    ")
    POLICY("
        <b>POLICY (策略)</b>
        <hr>
        id (PK)
        <br>name
        <br>rule
        <br>enabled
    ")
    AUDIT_LOG("
        <b>AUDIT_LOG (审计日志)</b>
        <hr>
        id (PK)
        <br>username
        <br>action
        <br>timestamp
    ")
    TEMPLATE("
        <b>CONFIG_TEMPLATE (配置模板)</b>
        <hr>
        id (PK)
        <br>name
        <br>content
    ")
    DEPLOYMENT("
        <b>DEPLOYMENT_RECORD (部署历史)</b>
        <hr>
        id (PK)
        <br>operator
        <br>template_name
        <br>status
    ")
    SETTING("
        <b>SETTING (系统设置)</b>
        <hr>
        key (PK)
        <br>value
    ")

    %% --- Relationship Definitions (实体间关系定义) ---
    USER -- "1..n<br>记录..." --> AUDIT_LOG
    USER -- "1..n<br>执行" --> DEPLOYMENT
    
    DEVICE -- "1..n<br>拥有" --> BLOCK
    DEVICE -- "m..n<br>应用" --> POLICY
    POLICY -- "m..n<br>被应用" --> DEVICE

    TEMPLATE -. "1..n<br>作为...的蓝本" .-> DEPLOYMENT

    %% --- Style Definitions ---
    linkStyle default stroke-width:2px
    classDef entity fill:#f0f9ff,stroke:#0284c7,stroke-width:2px;
    class USER,DEVICE,BLOCK,POLICY,AUDIT_LOG,TEMPLATE,DEPLOYMENT,SETTING entity;
```
*注：`m..n` 代表多对多关系，在物理实现中通过`device_policy_association`中间表实现。`1..n` 代表一对多关系。*
