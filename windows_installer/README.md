# BricksLLM Windows Installer

This folder contains scripts to automate the installation of BricksLLM on Windows 11/10 using WSL2.

## Prerequisites
1.  **Windows 10 version 2004+ (Build 19041 and higher) or Windows 11.**
2.  **NVIDIA GPU Drivers** installed on Windows.

## Installation
1.  Download this repository (or just this folder).
2.  Right-click `setup.bat` and select **Run as Administrator**.
3.  Follow the on-screen prompts.
    *   If WSL2 is not installed, the script will install it and ask you to reboot.
    *   After reboot, run `setup.bat` again.

## What it does
*   Enables WSL2.
*   Installs Ubuntu 22.04.
*   Installs Docker (Native inside WSL, no Docker Desktop required).
*   Installs NVIDIA Container Toolkit for GPU support.
*   Clones the BricksLLM repository.
*   Pulls all necessary Docker images.
*   Creates a Desktop Shortcut to start the application.
