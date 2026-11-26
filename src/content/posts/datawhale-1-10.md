---
title: "datawhale 1-10 大家一起求和"
author: "NullSky"
pubDatetime: 2026-11-26T23:12:00+08:00
featured: false
draft: false
tags:
  - "笔记"
description: "datawhale 1-10 大家一起求和。"
---

[原文链接](https://datawhalechina.github.io/hello-gpu/novice/reduction/)

## 核心概念

* **归约（Reduction）：** 把一堆数合成一个结果（如求和、求最大值）。串行累加 $N$ 个数每步都依赖上一步结果，要走 $N-1$ 轮；由于加法满足交换律和结合律，可以把互不相干的加法排进同一轮并行，搭成**求和树**，每轮数据减半（如 8 个数 $8 \rightarrow 4 \rightarrow 2 \rightarrow 1$ 只需 3 轮，64 个数 6 轮，1024 个数 10 轮）。
* **树形归约原则：** **轮内不等待，轮间要同步**。在共享内存（LDS）上搭树，每轮配对间隔 `s` 翻倍，每轮结束后都要 `__syncthreads()`，避免跑得快的小队提前进入下一轮，读到别的小队还没加完的旧值。
* **原子操作（`atomicAdd`）：** 把「读出、修改、写回」三步打包成不可被打断的整体。
  * **普通加（`out[0] += a[i]`）：** 多个线程同时读写同一格时，会读到同一个旧值并在写回时互相覆盖，导致丢数。
  * **原子加（`atomicAdd(&out[0], v)`）：** 保证结果一个都不丢，但所有写同一格的线程必须排队依次执行；往同一格加的线程越多，排队越长。

## 跨线程块汇总的两种方案

由于 LDS 和 `__syncthreads()` 只管同一个线程块，多个线程块之间汇总最终结果有两种常用写法：

| **方案** | **做法** | **特点** |
| :--- | :--- | :--- |
| **组内归约 + 原子加** | 每组先在 LDS 上归约成 1 个数，再只派每组的 `t == 0` 原子加进 `out[0]`。 | 原本所有线程都要在 `out[0]` 前排队，现在大幅缩短为只排 `gridDim.x` 次队（几组就排几次）。 |
| **写回 `part` + 二次启动** | 第一次 kernel 每组把结果写进各自独立的 `part[blockIdx.x]`；完成后再启动一次 kernel 把 `part` 汇总到 `out[0]`。 | 同一条 stream 里的 kernel 按顺序执行，第二次开工时第一次的所有组一定已经写完，全程无需原子操作。 |

## 例子：多组并行求和

任务：派 2 组、每组 64 个线程（或 4 组、每组 32 个线程），把 128 个数加进 `out[0]`，要求无数据竞争且尽量缩短 `out[0]` 前的排队。

```cpp
__global__ void sum_all(float* a, float* out) {
    __shared__ float box[64];                       // 货架开 64 格
    int t = threadIdx.x;
    box[t] = a[blockIdx.x * blockDim.x + t];        // 搬进本组货架
    __syncthreads();                                // 等整组放好

    int s = 1;                                      // 这一轮隔几格配对
    while (s < blockDim.x) {                        // 用 blockDim.x 兼容 64/32 等不同组大小
        if (t % (2 * s) == 0) {
            box[t] += box[t + s];
        }
        __syncthreads();                            // 每一轮之后等整组加完
        s = s * 2;                                  // 下一轮配对间隔翻倍
    }

    if (t == 0) {
        atomicAdd(&out[0], box[0]);                 // 每组只派线程 0 原子加进 out[0]
    }
}
```

若改用**二次启动**方案，则在第一次 kernel 末尾写 `if (t == 0) part[blockIdx.x] = box[0];`，随后在主机端再启动 `sum_part<<<1, 64>>>(d_part, d_out);` 完成最后汇总。

## 注意点

* **不能跨块同步：** 不能试图在单个 kernel 里让 `block 0` 调用 `__syncthreads()` 等待其他线程块把和写进 `part`，因为 `__syncthreads()` 只等同一线程块内的线程。
* **浮点精度差异：** 树形归约改变了加法的合并顺序，在真卡上使用 `float` 时，由于浮点加法不严格满足结合律，末位结果可能与串行顺序累加略有差异。
* **通用性：** 只要满足结合律（如求最大值、最小值），都可以直接套用相同的树形归约框架。
