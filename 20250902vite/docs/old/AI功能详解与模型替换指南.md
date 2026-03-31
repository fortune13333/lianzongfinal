# “链踪”AI功能详解与模型替换指南 (V9.0+ 模块化架构版)

## 引言

欢迎阅读“链踪”的AI功能深度指南。本项目深度集成了先进的人工智能技术，其V9.0及以上版本的架构经过精心设计，具备极高的灵活性，允许您通过简单的配置，轻松地将其AI引擎替换为任何您需要的模型。

本指南将为您清晰地阐明“链踪”全新的、统一的“AI驱动 (Driver)”架构，并提供替换AI模型的具体方法。

---

## 1. 统一的“AI驱动”架构

从V9.0版本开始，“链踪”的前后端都采用了统一的、基于**“适配器模式”**的AI调用架构。我们不再区分“前端AI”和“后端AI”，而是将所有AI功能都视为通过一个**可配置的“驱动”**来执行。

您可以把“链踪”系统想象成一台拥有标准USB接口的电脑，而不同的AI模型（Gemini, DeepSeek, Kimi, 或您自研的模型）则是不同的USB设备（U盘、鼠标、键盘）。只要您的“设备”符合USB标准，“链踪”就能识别并使用它。

### 1.1 后端AI驱动：核心治理的“引擎舱”

后端的AI功能（合规审计、智能分析、回滚方案生成）现在完全由一个可插拔的驱动模块负责。

*   **配置方式**: **只由 `config.ini` 文件中的 `[ai_provider]` 部分控制。**

    ```ini
    [ai_provider]
    # 在此选择后端AI驱动。可选项: gemini, http, spark
    driver = spark

    # --- Gemini 驱动配置 (当 driver = gemini 时生效) ---
    gemini_api_key = AIza...

    # --- HTTP 驱动配置 (当 driver = http 时生效) ---
    http_api_base_url = http://127.0.0.1:9000
    # ... 其他 http 配置 ...
    ```
*   **如何替换？**:
    1.  **对于Gemini**: 只需将 `driver` 设置为 `gemini` 并填入 `gemini_api_key`。
    2.  **对于讯飞星火**: 只需将 `driver` 设置为 `spark` 并在 `[spark]` 部分填入您的凭证。
    3.  **对于任何其他模型 (DeepSeek, Kimi等)**:
        *   将 `driver` 设置为 `http`。
        *   创建一个符合我们“API合约”的适配器服务（详见下文）。
        *   将适配器服务的地址和API密钥配置在 `http_...` 选项中。
        *   **您无需再修改任何一行Python代码。**

### 1.2 前端AI驱动：通过后端安全代理

从V9.x版本开始，为了根除前端密钥泄露的风险并统一AI技术栈，前端的AI功能（命令生成、配置体检）**不再直接调用任何外部AI服务**。

*   **工作原理**: 前端的所有AI请求，都会被发送到我们自己的**“链踪”后端代理**。后端代理在收到请求后，会安全地使用您在`config.ini`中配置的**同一个AI驱动**来执行任务，然后将结果返回给前端。
*   **配置方式**: 在 `.env` 文件中，将`VITE_AI_DRIVER`设置为`custom`，并将URL指向后端代理的相应接口。
    ```env
    VITE_AI_DRIVER=custom
    VITE_COMMAND_GENERATION_API_URL=/api/ai/generate-command
    VITE_CONFIG_CHECK_API_URL=/api/ai/check-config
    ```
*   **核心优势**:
    *   **绝对安全**: 任何AI密钥（无论是Gemini, Spark还是其他）都只存在于安全的后端服务器，永不暴露于浏览器。
    *   **技术栈统一**: 前端和后端的AI功能，现在由**同一个AI引擎**驱动。您在`config.ini`中将`driver`切换为`spark`，则**整个应用**（包括前端的命令生成）都会开始使用星火模型。

---

## 2. 如何为“链踪”后端添加新的AI模型？

得益于全新的模块化架构，为后端添加一个新的AI模型（例如，月之暗面的Kimi）变得异常简单。

#### **第一步：编写一个新的“驱动”文件**

1.  在后端的 `ai_drivers` 文件夹下，创建一个新的Python文件，例如 `kimi_driver.py`。
2.  在这个文件中，您必须实现**四个标准函数**，它们构成了“链踪”的AI“合约”：
    *   `analyze_changes(previous_config, new_config, change_description)`: 用于智能分析。
    *   `audit_compliance(policies, previous_config, new_config)`: 用于合规审计。
    *   `generate_commands(user_input, device, current_config, syntax_type)`: 用于前端的命令生成。
    *   `check_configuration(config, device, syntax_type)`: 用于前端的配置体检。
3.  在每个函数内部，您需要：
    *   编写适合目标AI模型（Kimi）的指令 (Prompt)。
    *   调用Kimi的API。
    *   将Kimi返回的结果，重组成“链踪”期望的Python字典或字符串格式并返回。

> **参考示例**: 您可以打开 `ai_drivers/gemini_driver.py` 或 `ai_drivers/spark_driver.py` 来查看一个完整的、可工作的驱动实现。

#### **第二步：修改 `config.ini`**

1.  （可选）在`config.ini`中为您的新模型添加一个配置区，用于存放API密钥等信息。
    ```ini
    [kimi]
    api_key = sk-your-kimi-key
    ```
2.  **最关键的一步**: 将`[ai_provider]`下的`driver`值，修改为您新创建的驱动文件的名称（不含`.py`后缀）。
    ```ini
    [ai_provider]
    driver = kimi
    ```

#### **第三步：重启后端代理**

重启您的`agent.py`服务。

**完成！** 您的“链踪”系统现在已经完全由Kimi模型驱动了。

---

## 3. (高级) 使用通用 `http` 驱动

如果您不想为每个模型都编写一个新的Python驱动文件，您也可以选择使用我们内置的通用`http`驱动。

这种模式下，您需要自己搭建一个独立的“适配器”服务。这个服务需要提供四个API端点，分别对应我们“合约”中的四个函数，并处理与最终AI模型的通信。

*   **配置**: 在`config.ini`中将`driver`设为`http`，并填入您的适配器服务的地址。
    ```ini
    [ai_provider]
    driver = http
    http_api_base_url = http://your-adapter-service:9000
    http_analysis_path = /analyze
    http_audit_path = /audit
    http_command_generation_path = /generate-command
    http_config_check_path = /check-config
    ```

通过这种全新的模块化架构，“链踪”的AI能力变得前所未有的灵活和强大，能够轻松适应任何企业环境的技术选型。