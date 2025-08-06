# LinkedCode

An interactive, real-time coding workspace that enables multiple participants to code together seamlessly. Users can generate or access exclusive collaboration rooms through unique IDs, co-edit code in real time, engage in team discussions via built-in chat, and organize project files — all from a single platform.

## ✨ Core Features

- 🖍️ **Collaborative Whiteboard**: Draw and sketch together in real-time 
- 🤖 **AI Assistant (Copilot)**: Use AI to generate, insert, or replace code seamlessly
- 📝 **Live Code Collaboration**: Work on code together in real-time across multiple files  
- 📂 **File & Folder Management**: Create, edit, rename, delete, and organize files and directories  
- 📦 **Download Projects**: Export the complete codebase as a `.zip` file  
- 🔑 **Unique Room IDs**: Instantly generate sharable room links for collaboration  
- 🌐 **Multi-language Support**: Write code in various programming languages  
- 🎨 **Syntax Highlighting**: Automatic detection and styling for different file types  
- ⚙️ **Run Code in Browser**: Execute code directly in the collaborative space  
- 🔄 **Instant Sync**: Real-time syncing of edits across all files and users  
- 🛎️ **User Join/Leave Alerts**: Get notified when users enter or leave a session  
- 👥 **User Presence List**: See who's online and active in the room  
- 💬 **Built-in Group Chat**: Communicate live with other collaborators  
- 👀 **Live Edit Indicators**: Tooltips showing who’s editing what, in real-time  
- 💡 **Smart Suggestions**: Auto-suggestions based on the programming language  
- 🔠 **Font & Style Options**: Customize font size and family  
- 🖌️ **Theme Switching**: Choose from multiple editor themes  
  

## 🧰 Tech Stack

- React  
- TypeScript   
- Tailwind CSS  
- Node.js  
- Express.js  
- Socket.io  
- Git  
- GitHub   
- Docker 

## ⚙️ Installation

1. **Fork this repository:** Click the Fork button located in the top-right corner of this page.
2. **Clone the repository:**
   ```bash
   git clone https://github.com/<yourgithubusername>/LinkedCode.git
   ```
3. **Create .env file:**
   Inside the client and server directories create `.env` and set:

   Frontend:

   ```bash
   VITE_BACKEND_URL=<your_server_url>
   ```

   Backend:

   ```bash
   PORT=3000
   ```

4. **Install dependencies:**
   ```bash
   npm install     
   ```
5. **Start the servers:**
   Frontend:
   ```bash
   cd client
   npm run dev
   ```
   Backend:
   ```bash
   cd server
   npm run dev
   ```
6. **Open the application:**
   ```bash
   http://localhost:5173/
   ```
