# NTU CSIE Workstation Guide (b14902002)

This document contains a comprehensive breakdown of the hardware, rules, and best practices for utilizing the NTU CSIE workstations and GPU servers, specifically for undergraduate accounts.

## Server Ecosystem
* **Standard Workstations (`ws1` to `ws10`)**: General purpose CPU servers.
* **GPU Servers (`meow1`, `meow2`)**: Specialized heavy-compute servers available to undergraduates.

### Known Hardware Profiles
#### `ws1.csie.ntu.edu.tw`
* **CPU**: At least 32 Cores available for multiprocessing.
* **Best Use**: CPU-heavy tasks like MCTS data generation.

#### `meow2.csie.ntu.edu.tw`
* **CPU**: 48 Cores (Intel Xeon Gold 5118 @ 2.30GHz)
* **GPU**: 4x NVIDIA GeForce RTX 4090 (24GB VRAM each)
* **Best Use**: PyTorch training, neural network evaluations, AlphaZero batched self-play.

## Undergraduate Rules & Resource Limits

To ensure fair sharing of departmental assets, the following limits are strictly enforced on undergraduate accounts:

1. **CPU Limit**: Maximum **3200%** CPU usage (equivalent to locking 32 CPU threads). 
   * *Actionable Tip*: When using `multiprocessing.Pool`, explicitly cap the `processes=32` rather than relying on `os.cpu_count()`, as `meow2` has 48 cores and will trigger quota violations.
2. **GPU Limit**: Maximum **1600%** GPU usage. 
   * *Actionable Tip*: Use the command `gpu-policy` in the terminal for real-time quota status.
   * *Actionable Tip*: When running PyTorch scripts on `meow2`, prepend `CUDA_VISIBLE_DEVICES=<id>` to restrict your script to a single GPU and prevent PyTorch from greedily allocating memory across all 4 GPUs.
3. **Storage Quota**: Undergraduates have a strict **1GB quota** for their home directory (`~`).
   * *Actionable Tip*: Never save large datasets (like `.pkl` files or model weights) in your home folder. Always route bulk output to `/tmp2/b14902002/`.

## Helpful Resources & Commands
* **Status Monitor**: [monitor.csie.ntu.edu.tw](https://monitor.csie.ntu.edu.tw) (Check real-time CPU/GPU load across all servers before launching jobs).
* **Check GPU Policy**: Run `gpu-policy` in the terminal.
* **Check GPU Load**: Run `nvidia-smi` in the terminal to see which of the 4 GPUs is currently idle.
* **Support Contact**: For package installations or hardware issues, contact `ta217@csie.ntu.edu.tw`.
* **CSIE Info Portal**: [info.csie.ntu.edu.tw](https://info.csie.ntu.edu.tw/) (for password resets and account unlocking).
