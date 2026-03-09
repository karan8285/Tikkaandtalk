# 📤 How to Push Code to GitHub - Step by Step

Complete guide for beginners to push Tikka N Talk app to GitHub.

---

## 📋 Prerequisites

- Your Tikka N Talk code ready
- Internet connection
- Terminal/Command Prompt access

---

## Step 1: Create GitHub Account (if you don't have one)

1. Go to https://github.com
2. Click "Sign up"
3. Enter your email, password, and username
4. Verify your email
5. Done! ✅

---

## Step 2: Install Git (if not installed)

### Check if Git is already installed:
```bash
git --version
```

If you see a version number (e.g., `git version 2.39.0`), you're good! Skip to Step 3.

### If not installed:

**Windows:**
1. Download from https://git-scm.com/download/win
2. Run installer (use default settings)
3. Restart terminal

**Mac:**
```bash
# Using Homebrew (recommended)
brew install git

# Or download from https://git-scm.com/download/mac
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install git
```

---

## Step 3: Configure Git (First Time Only)

Open terminal in your project folder and run:

```bash
# Set your name (will appear in commits)
git config --global user.name "Your Name"

# Set your email (use the email from GitHub)
git config --global user.email "your.email@example.com"

# Verify configuration
git config --list
```

---

## Step 4: Create a New Repository on GitHub

1. Go to https://github.com
2. Click the "+" icon (top right) → "New repository"
3. Fill in details:
   - **Repository name**: `tikka-n-talk` (or any name you want)
   - **Description**: "Mobile loyalty app for Tikka N Talk restaurant"
   - **Public or Private**: Choose based on your preference
     - Public: Anyone can see it
     - Private: Only you and collaborators can see it
   - **DO NOT** check "Add a README file" (we already have one)
   - **DO NOT** add .gitignore (we already have one)
4. Click "Create repository"

You'll see a page with instructions - keep it open!

---

## Step 5: Initialize Git in Your Project

Open terminal/command prompt in your project folder:

### Windows:
```bash
# Navigate to your project folder
cd path\to\your\tikka-n-talk

# For example:
cd C:\Users\YourName\Projects\tikka-n-talk
```

### Mac/Linux:
```bash
# Navigate to your project folder
cd /path/to/your/tikka-n-talk

# For example:
cd ~/Projects/tikka-n-talk
```

### Initialize Git:
```bash
# Initialize git repository
git init

# You should see: "Initialized empty Git repository in..."
```

---

## Step 6: Add All Files to Git

```bash
# Add all files to staging
git add .

# Check what will be committed
git status

# You should see a list of files in green
```

---

## Step 7: Create First Commit

```bash
# Create your first commit
git commit -m "Initial commit - Tikka N Talk loyalty app"

# You should see a summary of files committed
```

---

## Step 8: Connect to GitHub Repository

Go back to your GitHub repository page and copy the URL.

It will look like:
- HTTPS: `https://github.com/YOUR_USERNAME/tikka-n-talk.git`
- SSH: `git@github.com:YOUR_USERNAME/tikka-n-talk.git`

**Use HTTPS if you're unsure** (easier for beginners)

```bash
# Add remote repository (replace with YOUR repository URL)
git remote add origin https://github.com/YOUR_USERNAME/tikka-n-talk.git

# Verify remote was added
git remote -v

# You should see:
# origin  https://github.com/YOUR_USERNAME/tikka-n-talk.git (fetch)
# origin  https://github.com/YOUR_USERNAME/tikka-n-talk.git (push)
```

---

## Step 9: Rename Branch to 'main' (if needed)

```bash
# Check current branch name
git branch

# If it says "master", rename to "main"
git branch -M main

# If it already says "main", you're good!
```

---

## Step 10: Push Code to GitHub! 🚀

```bash
# Push your code to GitHub
git push -u origin main
```

### First Time: GitHub Authentication

You'll be asked to authenticate. Two options:

#### Option A: Personal Access Token (Recommended)

1. GitHub will open a browser window
2. Click "Authorize Git Credential Manager"
3. Done!

**OR if that doesn't work:**

1. Go to GitHub → Settings → Developer settings
2. Click "Personal access tokens" → "Tokens (classic)"
3. Click "Generate new token" → "Generate new token (classic)"
4. Give it a name: "Tikka N Talk App"
5. Select scopes: Check "repo" (full control of private repositories)
6. Click "Generate token"
7. **COPY THE TOKEN** (you won't see it again!)
8. When terminal asks for password, paste the token

#### Option B: GitHub CLI (Alternative)

```bash
# Install GitHub CLI
# Windows: Download from https://cli.github.com
# Mac: brew install gh
# Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Login
gh auth login

# Follow the prompts
```

---

## Step 11: Verify Upload ✅

1. Go to your GitHub repository page
2. Refresh the page
3. You should see all your files!
4. README.md will be displayed automatically

**Success!** 🎉 Your code is now on GitHub!

---

## 🔄 Making Changes Later

After you make changes to your code:

```bash
# 1. Check what changed
git status

# 2. Add changes
git add .

# 3. Commit with a message
git commit -m "Description of what you changed"

# 4. Push to GitHub
git push

# That's it! Changes are now on GitHub
```

---

## 📝 Common Git Commands

```bash
# See status of files
git status

# See commit history
git log

# See changes in files
git diff

# Undo changes in a file (before commit)
git checkout -- filename.txt

# Create a new branch
git checkout -b feature-name

# Switch branches
git checkout main

# Pull latest changes from GitHub
git pull

# Clone a repository
git clone https://github.com/username/repo.git
```

---

## 🐛 Troubleshooting

### "fatal: not a git repository"
```bash
# Make sure you're in the project folder
pwd  # Mac/Linux
cd   # Windows

# Then initialize git
git init
```

### "fatal: remote origin already exists"
```bash
# Remove existing remote
git remote remove origin

# Add the correct one
git remote add origin https://github.com/YOUR_USERNAME/tikka-n-talk.git
```

### "failed to push some refs"
```bash
# Pull first, then push
git pull origin main --rebase
git push -u origin main
```

### "Permission denied (publickey)"
Switch to HTTPS instead:
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/tikka-n-talk.git
git push -u origin main
```

### Large files causing issues
GitHub has a 100MB file size limit. Check:
```bash
# Find large files
find . -type f -size +50M

# If node_modules is tracked (shouldn't be):
git rm -r --cached node_modules
git commit -m "Remove node_modules"
git push
```

---

## 📁 What Gets Pushed?

Based on your `.gitignore` file:

### ✅ Will be pushed:
- All source code (`/src`)
- Configuration files
- Documentation files
- `package.json`
- Public assets

### ❌ Won't be pushed:
- `node_modules/` (dependencies)
- `dist/` (build output)
- `.env` files (sensitive data)
- `.DS_Store` (Mac system files)
- Editor config files

This is good! It keeps your repository clean.

---

## 🎯 Next Steps After Pushing

1. ✅ Code is on GitHub
2. ✅ Ready to deploy to Vercel
3. ✅ Can collaborate with others
4. ✅ Code is backed up

**Now you can deploy to Vercel!**

Follow the instructions in [VERCEL_QUICK_START.md](./VERCEL_QUICK_START.md)

---

## 📚 Learn More About Git

- Git Basics: https://git-scm.com/book/en/v2/Getting-Started-Git-Basics
- GitHub Guides: https://guides.github.com
- Interactive Tutorial: https://learngitbranching.js.org

---

## 💡 Pro Tips

1. **Commit Often**: Small, frequent commits are better than big ones
2. **Write Good Commit Messages**: 
   - ✅ "Fix sign out button requiring two clicks"
   - ❌ "fixed bug"
3. **Use Branches**: For new features, create a branch
4. **Pull Before Push**: Always pull latest changes before pushing
5. **Review Changes**: Use `git status` and `git diff` before committing

---

## ✅ Quick Reference

```bash
# Complete workflow
git status                          # Check what changed
git add .                          # Stage all changes
git commit -m "Your message here"  # Commit with message
git push                           # Push to GitHub

# First time setup
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

---

## 🆘 Still Stuck?

1. **Check Git Version**: `git --version` (should be 2.0+)
2. **Check Remote URL**: `git remote -v` (should match your GitHub repo)
3. **Check Branch**: `git branch` (should be on 'main')
4. **Read Error Messages**: They usually tell you what's wrong!

---

**You got this!** 💪 Follow the steps and you'll have your code on GitHub in no time!
