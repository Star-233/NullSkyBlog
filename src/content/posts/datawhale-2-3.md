---
title: "datawhale 2-3 搭建一个 Transformer"
author: "NullSky"
pubDatetime: 2026-11-26T23:13:53+08:00
featured: false
draft: false
tags:
  - "学习"
  - "笔记"
description: "datawhale happy-llm 2.3 搭建一个 Transformer 笔记：Embedding、位置编码与整体组装。"
---

[原文链接](https://datawhalechina.github.io/happy-llm/#/./chapter2/%E7%AC%AC%E4%BA%8C%E7%AB%A0%20Transformer%E6%9E%B6%E6%9E%84)

## 整体数据流动路径

从自然语言输入到最终预测词表概率分布，数据在 Transformer 中的流转路径如下：

**文本** $\xrightarrow{\text{Tokenizer}}$ **词元索引 `idx`** $\rightarrow$ **Embedding 词向量** $+$ **位置编码** $\rightarrow$ **Dropout** $\rightarrow$ **Encoder（$N$ 层）** $\rightarrow$ **Decoder（$N$ 层）** $\rightarrow$ **线性层 `lm_head`** $\rightarrow$ **输出 `logits` / 计算 `loss`**

| **组件** | **输入形状** | **输出形状** | **核心作用** |
| --- | --- | --- | --- |
| **Tokenizer** | 原始文本 | `(batch_size, seq_len)` | 把文本切分成 token 并映射为词表索引 |
| **Embedding 层 (`wte`)** | `(batch_size, seq_len)` | `(batch_size, seq_len, n_embd)` | 按索引查表，把离散编号转为连续向量 |
| **位置编码 (`wpe`)** | `(batch_size, seq_len, n_embd)` | `(batch_size, seq_len, n_embd)` | 将正余弦位置向量直接加到词向量上，注入语序 |
| **Encoder** | `(batch_size, seq_len, n_embd)` | `(batch_size, seq_len, n_embd)` | 堆叠 $N$ 层编码器，提取输入序列的上下文特征 |
| **Decoder** | `(batch_size, seq_len, n_embd)` + `enc_out` | `(batch_size, seq_len, n_embd)` | 堆叠 $N$ 层解码器，结合掩码自注意力与交叉注意力生成特征 |
| **输出头 (`lm_head`)** | 训练：`(b, t, n_embd)`；推理：`(b, 1, n_embd)` | 训练：`(b, t, vocab_size)`；推理：`(b, 1, vocab_size)` | 将隐藏向量投影回词表维度，得到各词得分 |

---

## 1. Embedding 层

**本质：** 一张可训练的查找表（权重矩阵形状为 `(vocab_size, embedding_dim)`）。词表里的每个编号对应矩阵中的一行向量，输入索引时直接取出对应行拼接输出。

* **例子：** 词表大小为 4，分词器把 `“我喜欢你”` 映射为 `我: 0`、`喜欢: 1`、`你: 2`。输入索引序列 `[0, 1, 2]`（`batch_size=1, seq_len=3`）后，Embedding 层从权重表第 0、1、2 行各取一个长度为 `dim` 的向量，输出形状为 `(1, 3, dim)`。
* **实现：**

```python
self.tok_embeddings = nn.Embedding(args.vocab_size, args.dim)
```

---

## 2. 位置编码（Positional Encoding）

### 为什么注意力模型必须加位置编码？

注意力机制对句子中所有词做并行计算时，每个位置在结构上是**完全对称**的——打乱词序不会改变单个词算出的注意力集合，`“我喜欢你”` 和 `“你喜欢我”` 在没有位置信息时无法区分。因此必须在输入层把**位置信息**加进词向量。

### 正余弦绝对位置编码（Sinusoidal）

用不同频率的正弦（偶数维）和余弦（奇数维）生成与词向量等长的位置向量，再与词向量**逐元素相加**：

$$
PE(pos, 2i) = \sin\left(\frac{pos}{10000^{2i / d_{model}}}\right), \quad PE(pos, 2i+1) = \cos\left(\frac{pos}{10000^{2i / d_{model}}}\right)
$$

* **$pos$**：token 在句子中的位置（$0, 1, 2, \dots$）。
* **$2i / 2i+1$**：向量内部维度的奇偶下标（越往后的维度波长越长，变化越慢）。

### 为什么选用正余弦编码？（直观优势 + 数学核心）

* **能外推到更长序列：** 由公式直接算出，不受训练集最大句子长度限制（例如训练最长见过 20 个词，推理遇到第 21 个词照样能算）。
* **绝对位置里蕴含相对位置：** 利用三角函数和差角公式，偏移固定距离 $k$ 后的位置编码 $PE(pos + k)$ 可以表示为 $PE(pos)$ 的线性组合。
* **泰勒展开视角的推导核心：** 把带位置编码的输入在原词向量处做二阶泰勒展开，其中同时关联两个位置 $m, n$ 的交叉项为 $\boldsymbol{p}_m^\top \boldsymbol{\mathcal{H}} \boldsymbol{p}_n$。要让该项只与相对距离 $m-n$ 有关：
  1. 若假设 $\boldsymbol{\mathcal{H}}$ 为单位矩阵，内积 $\langle \boldsymbol{p}_m, \boldsymbol{p}_n \rangle = g(m-n)$ 在复数域求解得到的二维解就是 $(\cos m\theta, \sin m\theta)$；
  2. 推广到高维即每两维配一个频率 $\theta_i = 10000^{-2i/d}$（保证 $|m-n|$ 越大内积越趋于 0）；
  3. 即使 $\boldsymbol{\mathcal{H}}$ 仅近似为对角矩阵，通过积化和差展开后，依然保留了 $\cos((m-n)\theta_i)$ 这一相对位置项。

### PyTorch 实现要点

```python
class PositionalEncoding(nn.Module):
    def __init__(self, args):
        super().__init__()
        pe = torch.zeros(args.block_size, args.n_embd)
        position = torch.arange(0, args.block_size).unsqueeze(1)
        # 用 exp + log 等价计算 1 / 10000^(2i / d)，数值更稳定
        div_term = torch.exp(
            torch.arange(0, args.n_embd, 2) * -(math.log(10000.0) / args.n_embd)
        )
        pe[:, 0::2] = torch.sin(position * div_term) # 偶数维用 sin
        pe[:, 1::2] = torch.cos(position * div_term) # 奇数维用 cos
        pe = pe.unsqueeze(0)                        # 扩成 (1, block_size, n_embd) 方便按 batch 广播
        self.register_buffer("pe", pe)              # 注册为缓冲区：随模型保存和迁移设备，但不参与梯度更新

    def forward(self, x):
        # 按当前序列长度切片并加到词向量上，关闭梯度
        return x + self.pe[:, :x.size(1)].requires_grad_(False)
```

---

## 3. 完整 Transformer 组装与关键细节

### 为什么教程代码采用 Pre-Norm，而不是论文图里的 Post-Norm？

| **归一化位置** | **对应位置** | **计算顺序** | **特点** |
| --- | --- | --- | --- |
| **Post-Norm** | 原论文配图 | `LayerNorm(x + SubLayer(x))` | 归一化放在残差相加之后，深层网络梯度较难稳定 |
| **Pre-Norm** | 原论文源码 & 当前 LLM 主流 | `x + SubLayer(LayerNorm(x))` | 归一化放在注意力/前馈层之前，**训练 loss 更稳定** |

### 核心代码（结构 + 初始化 + 前向分支）

```python
class Transformer(nn.Module):
    def __init__(self, args):
        super().__init__()
        assert args.vocab_size is not None and args.block_size is not None
        self.args = args
        self.transformer = nn.ModuleDict(dict(
            wte = nn.Embedding(args.vocab_size, args.n_embd), # 词嵌入
            wpe = PositionalEncoding(args),                  # 位置编码
            drop = nn.Dropout(args.dropout),
            encoder = Encoder(args),                         # N 层编码器
            decoder = Decoder(args),                         # N 层解码器
        ))
        # 输出头：将隐藏特征映射回词表大小（无 bias）
        self.lm_head = nn.Linear(args.n_embd, args.vocab_size, bias=False)

        self.apply(self._init_weights) # 统一初始化所有子模块权重
        print("number of parameters: %.2fM" % (self.get_num_params() / 1e6,))

    def get_num_params(self, non_embedding=False):
        n_params = sum(p.numel() for p in self.parameters())
        if non_embedding:
            n_params -= self.transformer.wte.weight.numel() # 可选排除词嵌入参数量
        return n_params

    def _init_weights(self, module):
        # 线性层与嵌入层权重均按 N(0, 0.02^2) 初始化，偏置置零
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx, targets=None):
        b, t = idx.size()
        assert t <= self.args.block_size, f"序列长度 {t} 超过上限 {self.args.block_size}"

        tok_emb = self.transformer.wte(idx)          # (b, t, n_embd)
        pos_emb = self.transformer.wpe(tok_emb)      # 叠加位置编码
        x = self.transformer.drop(pos_emb)
        enc_out = self.transformer.encoder(x)        # 编码输出
        x = self.transformer.decoder(x, enc_out)     # 解码输出

        if targets is not None:
            # 训练阶段：全序列每个位置都通过 lm_head 算交叉熵 loss
            logits = self.lm_head(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)
        else:
            # 推理阶段：只需预测下一个词，切片 [-1] 只保留最后一个时间步（用列表保持三维形状）
            logits = self.lm_head(x[:, [-1], :])
            loss = None

        return logits, loss
```

### 几个容易忽略的实现细节

1. **`register_buffer("pe", pe)` 的作用：** 位置编码矩阵不是需要学习的权重，用 `register_buffer` 注册后，调用 `model.cuda()` 时它会自动跟着进显存，同时不会被优化器更新。
2. **为什么推理阶段写 `x[:, [-1], :]` 而不是 `x[:, -1, :]`？** 用列表 `[-1]` 索引可以保留中间的时间维度（形状维持 `(b, 1, n_embd)` 而不是被降维成 `(b, n_embd)`），保证训练和推理输出的 `logits` 维度一致。
3. **关于 `idx` 的形状：** 教程正文描述词表输入时举了三维例子 `[[[0],[1],[2]]]`，但实际在 `Transformer.forward` 代码里写的是 `b, t = idx.size()`，也就是 PyTorch `nn.Embedding` 标准接收的二维张量 `(batch_size, seq_len)`。
