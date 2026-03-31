<!-- 封面页 -->
<!-- 字体：黑龙江大学校名手写体 -->
<!-- 论文题目：黑体小二号字 -->
<!-- 其他信息：黑体三号字 -->

<div align="center">

# **黑龙江大学**

## **本科学生毕业论文**

<br/><br/>

| | |
| :--- | :--- |
| **论文题目：** | **基于区块链与AI的智能网络配置审计系统设计与实现** |
| **学 &nbsp; &nbsp; &nbsp; 院：** | （请填写您的学院） |
| **年 &nbsp; &nbsp; &nbsp; 级：** | （请填写您的年级） |
| **专 &nbsp; &nbsp; &nbsp; 业：** | （请填写您的专业） |
| **姓 &nbsp; &nbsp; &nbsp; 名：** | （请填写您的姓名） |
| **学 &nbsp; &nbsp; &nbsp; 号：** | （请填写您的学号） |
| **指导教师：** | （请填写您的导师姓名） |

<br/><br/><br/><br/>

**年 &nbsp; 月 &nbsp; 日**

</div>

<div style="page-break-after: always;"></div>

<!-- 摘要页 -->
<!-- 另起一页 -->
<!-- “摘要”二字：黑体三号，居中 -->
<!-- 正文：宋体小四号，1.5倍行距 -->
<!-- “关键词”三字：黑体小四号 -->
<!-- 关键词内容：宋体小四号，分号分隔 -->

<div align="center">

### **摘要**

</div>

&nbsp;&nbsp;&nbsp;&nbsp;随着网络技术的飞速发展与网络规模的日益庞大，网络配置的复杂性与日俱增，传统的手动配置管理方式面临着变更过程不透明、操作失误难追溯、安全合规审计困难等严峻挑战。为解决这些痛点，本文以作者的毕业设计项目“链踪”为基础，详细阐述了一个智能网络配置审计系统的完整设计与实现过程。该系统创新性地将区块链思想与人工智能（AI）大语言模型深度融合，旨在为现代网络配置管理提供一个安全、可追溯、可审计且高度智能化的解决方案。

&nbsp;&nbsp;&nbsp;&nbsp;本研究首先对网络配置管理的现状及挑战进行了分析，并在此基础上确立了系统的核心设计原则。随后，设计了系统总体架构，采用前后端分离模式，前端基于React技术栈构建用户交互界面，后端则通过Python FastAPI框架实现一个轻量级本地代理，负责与多厂商网络设备通信、执行核心业务逻辑及持久化数据。系统的核心创新在于构建了一个基于哈希链的不可变“审计链”，为每一次配置变更提供加密链接、不可篡改的证据。在此之上，本文重点阐述了一个由五道防线组成的“法证级”安全模型的设计与实现，该模型集成了AI驱动的“事前治理”引擎、基于规则的实时命令拦截和确保审计闭环的“断连自动审计”机制，实现了从“事后追溯”到“防患于未然”的模式转变。此外，系统还深度集成了AI辅助工作流，并通过一个“可插拔”的AI驱动架构，以讯飞星火模型为例，展示了其高度的灵活性和可扩展性。

&nbsp;&nbsp;&nbsp;&nbsp;最后，通过在模拟网络环境中进行系统测试，验证了各项核心功能的有效性与稳定性。测试结果表明，“链踪”系统能够可靠地记录每一次配置变更，准确地执行多层次事前治理，并提供流畅、安全的交互体验，证明了本研究方案在提升网络配置管理安全性、透明度与智能化水平方面的可行性与应用价值。

<br>

**关键词：** 网络配置管理；区块链；人工智能；配置审计；AIOps；事前治理

<div style="page-break-after: always;"></div>

<!-- 英文摘要页 -->
<!-- 另起一-页 -->
<!-- 标题：Times New Roman，三号，加粗，居中 -->
<!-- 正文：Times New Roman，小四号，1.5倍行距 -->
<!-- 关键词标题：Times New Roman，小四号，加粗 -->
<!-- 关键词内容：Times New Roman，小四号，分号分隔 -->

<div align="center">

### **Abstract**

</div>

&nbsp;&nbsp;&nbsp;&nbsp;With the rapid development of network technology and the increasing scale of networks, the complexity of network configuration has grown significantly. Traditional manual configuration management methods face severe challenges, including opaque change processes, difficulty in tracing operational errors, and complexities in security and compliance auditing. To address these pain points, this thesis, based on the author's graduation project "ChainTrace", elaborates on the complete design and implementation of an intelligent network configuration auditing system. This system innovatively integrates blockchain concepts with Artificial Intelligence (AI) large language models, aiming to provide a secure, traceable, auditable, and highly intelligent solution for modern network configuration management.

&nbsp;&nbsp;&nbsp;&nbsp;This paper begins by analyzing the current state and challenges of network configuration management, establishing the core design principles for the system. Subsequently, the overall system architecture is designed using a front-end and back-end separation model. The front-end is built with the React technology stack, while the back-end employs a lightweight local agent based on the Python FastAPI framework. The core innovation lies in constructing an immutable "audit chain" based on a hash chain, providing cryptographically linked and tamper-proof evidence for every configuration change. Building upon this, the thesis focuses on the design and implementation of a "forensic-grade" security model composed of five defense lines, which integrates an AI-powered "proactive governance" engine, rule-based real-time command interception, and an "auto-audit on disconnect" mechanism to ensure a closed-loop audit trail, shifting the paradigm from "post-mortem traceability" to "proactive prevention". Furthermore, the system deeply integrates AI-assisted workflows and demonstrates high flexibility and scalability through a "pluggable" AI driver architecture, using the iFlytek Spark model as a case study.

&nbsp;&nbsp;&nbsp;&nbsp;Finally, through system testing in a simulated network environment, the effectiveness and stability of all core functions, including advanced security features like "Secure Write to Startup-Config", are verified. The test results demonstrate that the "ChainTrace" system can reliably record every configuration change, accurately perform multi-layered proactive governance, and provide a smooth, secure interactive experience. This validates the feasibility and practical value of the proposed research in enhancing the security, transparency, and intelligence of network configuration management.

<br>

**Keywords:** Network Configuration Management; Blockchain; Artificial Intelligence; Configuration Auditing; AIOps; Proactive Governance

<div style="page-break-after: always;"></div>

<!-- 目录页 -->
<!-- 另起一-页 -->
<!-- “目录”二字：黑体小二号，居中 -->
<!-- 一级标题：黑体小四号 -->
<!-- 其他标题：宋体小四号 -->
<!-- 行距：1.5倍 -->

<div align="center">

## **目录**

</div>

**第一章 绪论**...................................................................................................................1

&nbsp;&nbsp;&nbsp;&nbsp;1.1 研究背景与意义.....................................................................................................1

&nbsp;&nbsp;&nbsp;&nbsp;1.2 国内外研究现状.....................................................................................................2

&nbsp;&nbsp;&nbsp;&nbsp;1.3 主要研究工作.........................................................................................................3

&nbsp;&nbsp;&nbsp;&nbsp;1.4 论文的组织结构.....................................................................................................4

**第二章 系统相关技术概述**...............................................................................................5

&nbsp;&nbsp;&nbsp;&nbsp;2.1 区块链核心技术原理.............................................................................................5

&nbsp;&nbsp;&nbsp;&nbsp;2.2 AI大语言模型技术...............................................................................................7

&nbsp;&nbsp;&nbsp;&nbsp;2.3 前后端分离架构...................................................................................................9

&nbsp;&nbsp;&nbsp;&nbsp;2.4 Netmiko网络自动化库.........................................................................................10

**第三章 智能网络配置审计系统总体设计**.....................................................................12

&nbsp;&nbsp;&nbsp;&nbsp;3.1 系统设计目标与原则...........................................................................................12

&nbsp;&nbsp;&nbsp;&nbsp;3.2 系统总体架构设计...............................................................................................13

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.2.1 物理部署架构...........................................................................................13

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.2.2 前后端分离的应用架构...........................................................................14

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.2.3 系统核心数据流分析...............................................................................15

&nbsp;&nbsp;&nbsp;&nbsp;3.3 功能模块设计.......................................................................................................16

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.3.1 核心审计链模块.......................................................................................16

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.3.2 AI智能治理模块.......................................................................................17

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.3.3 实时交互终端模块...................................................................................17

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.3.4 自动化与管理模块...................................................................................18

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.3.5 用户界面(UI)与用户体验(UX)设计.......................................................18

&nbsp;&nbsp;&nbsp;&nbsp;3.4 数据库设计.........................................................................................................19

&nbsp;&nbsp;&nbsp;&nbsp;3.5 核心安全模型设计：五道“法证级”防线 ...........................................................21

**第四章 核心功能模块的实现**.........................................................................................22

&nbsp;&nbsp;&nbsp;&nbsp;4.1 不可变审计链的实现...........................................................................................22

&nbsp;&nbsp;&nbsp;&nbsp;4.2 可插拔AI驱动架构与“事前治理”引擎的实现 ...................................................25

&nbsp;&nbsp;&nbsp;&nbsp;4.3 安全交互式终端的实现.......................................................................................30

&nbsp;&nbsp;&nbsp;&nbsp;4.4 企业级管理功能的实现 .......................................................................................32

&nbsp;&nbsp;&nbsp;&nbsp;4.5 “安全写入启动配置”功能的实现 .......................................................................34

**第五章 系统测试与分析**...................................................................................................33

&nbsp;&nbsp;&nbsp;&nbsp;5.1 测试环境搭建.......................................................................................................33

&nbsp;&nbsp;&nbsp;&nbsp;5.2 功能测试...............................................................................................................33

&nbsp;&nbsp;&nbsp;&nbsp;5.3 性能、安全性与健壮性分析...............................................................................39

**第六章 总结与展望**...........................................................................................................41

&nbsp;&nbsp;&nbsp;&nbsp;6.1 工作总结...............................................................................................................41

&nbsp;&nbsp;&nbsp;&nbsp;6.2 创新点总结...........................................................................................................42

&nbsp;&nbsp;&nbsp;&nbsp;6.3 不足之处与未来展望...........................................................................................42

**参考文献**.............................................................................................................................44

**致谢**.....................................................................................................................................47

**附录**.....................................................................................................................................48
