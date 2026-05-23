# Echo

A mini social media web app with user profiles, posts, comments, likes, and follow/unfollow.

## Tech stack

- **Frontend:** HTML, CSS, Vanilla JavaScript (Fetch API)
- **Backend:** Node.js + Express (REST API, JWT auth)
- **Database:** MongoDB (Mongoose)

## Features

- User registration and login
- User profiles (view, edit, follow/unfollow)
- Create posts with **text and/or images** (uploaded to `public/uploads`)
- Comment on posts (stored in MongoDB `comments` collection)
- Like / unlike posts (user IDs stored in each post's `likes` array)
- Feed from you and people you follow

## Project structure

```
link/
├── package.json
├── .env.example
├── README.md
├── server/
│   ├── index.js
│   ├── config/db.js
│   ├── middleware/auth.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Post.js
│   │   └── Comment.js
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       ├── posts.js
│       └── comments.js
└── public/
    ├── index.html
    ├── login.html
    ├── signup.html
    ├── feed.html
    ├── profile.html
    ├── css/styles.css
    └── js/
        ├── api.js
        ├── auth.js
        ├── feed.js
        └── profile.js
```

## Setup

1. **Install dependencies**

   ```bash
   cd link
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and set values:

   ```
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/link
   JWT_SECRET=your_long_random_secret_here
   ```

3. **Start MongoDB** (local install or Docker):

   ```bash
   docker run -d -p 27017:27017 --name link-mongo mongo:7
   ```

4. **Run the server**

   ```bash
   npm start
   ```

   For auto-restart on file changes:

   ```bash
   npm run dev
   ```

5. **Open the app**

   Visit [http://localhost:3000](http://localhost:3000)

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/users/:username` | Profile |
| PUT | `/api/users/profile` | Update own profile |
| POST/DELETE | `/api/users/:id/follow` | Follow / unfollow |
| GET | `/api/users/:username/posts` | User posts |
| GET | `/api/posts/feed` | Feed |
| POST | `/api/posts` | Create post (multipart: `content`, `image`) |
| POST | `/api/posts/:id/like` | Like post |
| DELETE | `/api/posts/:id/like` | Unlike post |
| GET | `/api/posts/:id/comments` | List comments |
| POST | `/api/comments` | Add comment |

Protected routes require header: `Authorization: Bearer <token>`

## View another user's profile

Open `/profile.html?u=username`
