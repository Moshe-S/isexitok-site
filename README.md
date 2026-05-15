# IsExitOK

Live website: https://isexitok.com

Frontend for the "Is it OK to leave the shelter?" project.

A lightweight client-side website for checking recent Home Front Command (Pikud HaOref) alert status by location.

## Disclaimer

This website is not an official source.  
Always follow official Home Front Command (Pikud HaOref) instructions.

Official website: https://www.oref.org.il/

## Features

- Automatic polling-based updates
- Manual refresh option for user-initiated checks
- API and data-source status indication
- Location search
- Favorites ("My Places") and local-only preferences via localStorage
- No cookies or user tracking in the application
- Mobile-friendly responsive UI
- Accessibility-focused interface
- Frontend and API architectural separation

## Architecture

This repository contains the frontend only.

The system communicates with a separately developed API server.

## Data Sources

The API server processes alert-related data from external public and community-maintained sources, including fallback mechanisms for resiliency and continuity.

Current implementation relies in part on the Pikud HaOref API wrapper by Elad Nava:  
https://github.com/eladnava/pikud-haoref-api

## System Architecture

- Frontend: HTML, CSS, Vanilla JavaScript
- API server: Node.js
- Nginx reverse proxy and HTTPS
- DNS and protection layer: Cloudflare