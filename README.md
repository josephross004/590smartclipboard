# Smart Clipboard

A lightweight web-based tool for basketball coaches to draw and export motion plays for Gemini and other LLMs.

## Features
- **Interactive Canvas**: Draw custom motion paths for all 5 standard basketball positions (PG, SG, SF, PF, C).
- **Auto-Snap**: Automatically simplifies complex hand-drawn paths into 5 key coordinate points for clean data extraction.
- **Gemini-Ready Export**: One-click export to JSON format, optimized for use with Large Language Models.
- **Fast and Responsive**: Built with React, Vite, and Tailwind CSS.

## Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation
Clone the repository and install the dependencies:

```bash
npm install
```

### Running Locally
To start the development server:

```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) to see the app in action.

### Building for Production
To create a optimized production build:

```bash
npm run build
```

## How to use
1. **Draw**: Click and drag on any player circle to draw their movement path on the court.
2. **Export**: Click the **"Export Play for Gemini"** button to copy the movement data to your clipboard.
3. **Reset**: Use the **"Reset Trails"** button to clear the motion paths and start over.
