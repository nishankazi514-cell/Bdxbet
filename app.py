import sqlite3
import os
import random
import string
import time
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'bdxbet_secure_secret_key_2026')
DB_FILE = 'users.db'


# ============================================================
# DATABASE
# ============================================================
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def generate_unique_uid(cursor):
    chars = string.ascii_uppercase + string.digits
    while True:
        uid = 'LK-' + ''.join(random.choices(chars, k=8))
        cursor.execute("SELECT 1 FROM users WHERE uid = ?", (uid,))
        if not cursor.fetchone():
            return uid


def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            avatar TEXT DEFAULT '👨‍💼',
            balance REAL DEFAULT 2500.0,
            vip INTEGER DEFAULT 0,
            created_at INTEGER
        )
    ''')

    for ddl in [
        "ALTER TABLE users ADD COLUMN uid TEXT",
        "ALTER TABLE users ADD COLUMN name TEXT",
        "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '👨‍💼'",
        "ALTER TABLE users ADD COLUMN created_at INTEGER",
    ]:
        try: c.execute(ddl)
        except sqlite3.OperationalError: pass

    c.execute('''
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uid TEXT NOT NULL,
            friend_uid TEXT NOT NULL,
            created_at INTEGER,
            UNIQUE(user_uid, friend_uid)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_uid TEXT NOT NULL,
            to_uid TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            UNIQUE(from_uid, to_uid)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_uid TEXT NOT NULL,
            to_uid TEXT NOT NULL,
            text TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at INTEGER
        )
    ''')

    conn.commit()
    conn.close()


init_db()


# ============================================================
# HELPERS
# ============================================================
def current_user():
    phone = session.get('user_phone')
    if not phone:
        return None
    conn = get_db()
    u = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
    conn.close()
    return u


def user_to_dict(u):
    if not u:
        return None
    return {
        'uid': u['uid'],
        'name': u['name'] or f"User {str(u['phone'])[-4:]}",
        'avatar': u['avatar'] or '👨‍💼',
        'coins': u['balance'],
        'vip': u['vip'],
        'phone': u['phone'],
    }


# ============================================================
# PAGE ROUTES
# ============================================================
@app.route('/')
def home():
    """রুট URL — লগইন থাকলে /ludo, নাহলে /login"""
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return redirect(url_for('ludo_game'))


@app.route('/login')
def login_page():
    """লগইন পেজ — ইতিমধ্যে লগইন থাকলে /ludo তে পাঠায়"""
    if session.get('user_phone'):
        return redirect(url_for('ludo_game'))
    return render_template('login.html')


@app.route('/ludo')
def ludo_game():
    """লুডো গেম — লগইন না থাকলে /login এ পাঠায়"""
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('ludo.html')


@app.route('/speed-tap')
def speed_tap():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('Speedtap.html')


# ============================================================
# AUTH API
# ============================================================
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    phone = (data.get('phone') or '').strip()
    password = data.get('password') or ''
    name = (data.get('name') or '').strip()[:20]
    avatar = data.get('avatar') or '👨‍💼'

    if not phone or not password:
        return jsonify({'success': False, 'message': 'ফোন ও পাসওয়ার্ড দিন'})

    hashed = generate_password_hash(password)
    conn = get_db()
    c = conn.cursor()
    try:
        existing = c.execute("SELECT uid FROM users WHERE phone = ?", (phone,)).fetchone()
        if existing:
            uid = existing['uid'] or generate_unique_uid(c)
            c.execute("UPDATE users SET password = ?, uid = ?, name = ?, avatar = ? WHERE phone = ?",
                      (hashed, uid, name or None, avatar, phone))
        else:
            uid = generate_unique_uid(c)
            c.execute(
                "INSERT INTO users (uid, phone, password, name, avatar, balance, vip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (uid, phone, hashed, name or None, avatar, 2500.0, 0, int(time.time()))
            )
        conn.commit()
        session['user_phone'] = phone
        return jsonify({'success': True, 'uid': uid, 'message': 'রেজিস্ট্রেশন সফল'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    phone = (data.get('phone') or '').strip()
    password = data.get('password') or ''

    conn = get_db()
    u = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
    conn.close()

    if u and check_password_hash(u['password'], password):
        session['user_phone'] = phone
        return jsonify({'success': True, 'user': user_to_dict(u), 'message': 'লগইন সফল'})
    return jsonify({'success': False, 'message': 'ফোন বা পাসওয়ার্ড ভুল'}), 400


@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_phone', None)
    return jsonify({'success': True})


@app.route('/logout')
def logout_page():
    session.pop('user_phone', None)
    return redirect(url_for('login_page'))


@app.route('/api/user', methods=['GET'])
def get_user():
    u = current_user()
    if not u:
        return jsonify({'loggedIn': False})
    return jsonify({'loggedIn': True, **user_to_dict(u)})


@app.route('/api/user/update', methods=['POST'])
def update_user():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    data = request.json or {}
    new_name = (data.get('name') or '').strip()[:20]
    new_avatar = data.get('avatar')
    conn = get_db()
    if new_name:
        conn.execute("UPDATE users SET name = ? WHERE phone = ?", (new_name, u['phone']))
    if new_avatar:
        conn.execute("UPDATE users SET avatar = ? WHERE phone = ?", (new_avatar, u['phone']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ============================================================
# FRIEND API
# ============================================================
@app.route('/api/friend/search', methods=['POST'])
def api_friend_search():
    u = current_user()
    if not u:
        return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

    q = ((request.json or {}).get('uid') or '').strip().upper()
    if not q:
        return jsonify({'success': False, 'message': 'UID দিন'})
    if not q.startswith('LK-'):
        q = 'LK-' + q

    conn = get_db()
    found = conn.execute("SELECT * FROM users WHERE uid = ?", (q,)).fetchone()
    conn.close()

    if not found:
        return jsonify({'success': False, 'message': 'ইউজার পাওয়া যায়নি'})
    if found['uid'] == u['uid']:
        return jsonify({'success': False, 'message': 'এটা আপনার নিজের UID'})

    return jsonify({'success': True, 'user': user_to_dict(found)})


@app.route('/api/friend/request', methods=['POST'])
def send_friend_request():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    target = ((request.json or {}).get('target_uid') or '').strip().upper()
    if not target or target == u['uid']:
        return jsonify({'success': False, 'message': 'ভুল UID'})

    conn = get_db()
    other = conn.execute("SELECT * FROM users WHERE uid = ?", (target,)).fetchone()
    if not other:
        conn.close()
        return jsonify({'success': False, 'message': 'ইউজার নেই'})

    already = conn.execute("SELECT 1 FROM friends WHERE user_uid = ? AND friend_uid = ?",
                           (u['uid'], target)).fetchone()
    if already:
        conn.close()
        return jsonify({'success': True, 'status': 'already_friends'})

    reverse = conn.execute(
        "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
        (target, u['uid'])).fetchone()
    if reverse:
        conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (reverse['id'],))
        conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                     (u['uid'], target, int(time.time())))
        conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                     (target, u['uid'], int(time.time())))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'status': 'became_friends'})

    conn.execute(
        "INSERT OR REPLACE INTO friend_requests (from_uid, to_uid, status, created_at) VALUES (?, ?, 'pending', ?)",
        (u['uid'], target, int(time.time()))
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'status': 'request_sent'})


@app.route('/api/friend/accept', methods=['POST'])
def accept_friend_request():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    from_uid = ((request.json or {}).get('from_uid') or '').strip().upper()
    conn = get_db()
    req = conn.execute(
        "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
        (from_uid, u['uid'])).fetchone()
    if not req:
        conn.close()
        return jsonify({'success': False, 'message': 'রিকোয়েস্ট নেই'})
    conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (req['id'],))
    conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                 (u['uid'], from_uid, int(time.time())))
    conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                 (from_uid, u['uid'], int(time.time())))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/friend/reject', methods=['POST'])
def reject_friend_request():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    from_uid = ((request.json or {}).get('from_uid') or '').strip().upper()
    conn = get_db()
    conn.execute("UPDATE friend_requests SET status = 'rejected' WHERE from_uid = ? AND to_uid = ?",
                 (from_uid, u['uid']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/friend/list', methods=['GET'])
def friend_list():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    conn = get_db()
    friends = conn.execute(
        "SELECT u.* FROM friends f JOIN users u ON u.uid = f.friend_uid WHERE f.user_uid = ?",
        (u['uid'],)).fetchall()
    incoming = conn.execute(
        "SELECT u.* FROM friend_requests fr JOIN users u ON u.uid = fr.from_uid WHERE fr.to_uid = ? AND fr.status = 'pending'",
        (u['uid'],)).fetchall()
    outgoing = conn.execute(
        "SELECT u.* FROM friend_requests fr JOIN users u ON u.uid = fr.to_uid WHERE fr.from_uid = ? AND fr.status = 'pending'",
        (u['uid'],)).fetchall()
    conn.close()
    return jsonify({
        'success': True,
        'friends': [user_to_dict(x) for x in friends],
        'incoming': [user_to_dict(x) for x in incoming],
        'outgoing': [user_to_dict(x) for x in outgoing],
    })


# ============================================================
# CHAT API
# ============================================================
@app.route('/api/messages/send', methods=['POST'])
def send_message():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    data = request.json or {}
    to_uid = (data.get('to_uid') or '').strip().upper()
    text = (data.get('text') or '').strip()[:500]
    if not to_uid or not text:
        return jsonify({'success': False})
    conn = get_db()
    conn.execute("INSERT INTO messages (from_uid, to_uid, text, created_at) VALUES (?, ?, ?, ?)",
                 (u['uid'], to_uid, text, int(time.time())))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/messages/list', methods=['POST'])
def list_messages():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    other = ((request.json or {}).get('with_uid') or '').strip().upper()
    if not other:
        return jsonify({'success': False})
    conn = get_db()
    rows = conn.execute('''
        SELECT * FROM messages
        WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
        ORDER BY created_at ASC LIMIT 200
    ''', (u['uid'], other, other, u['uid'])).fetchall()
    conn.execute("UPDATE messages SET is_read = 1 WHERE from_uid = ? AND to_uid = ?", (other, u['uid']))
    conn.commit()
    conn.close()
    return jsonify({
        'success': True,
        'messages': [
            {'id': r['id'], 'from': r['from_uid'], 'text': r['text'], 'timestamp': r['created_at'] * 1000}
            for r in rows
        ]
    })


@app.route('/api/messages/inbox', methods=['GET'])
def inbox():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    conn = get_db()
    rows = conn.execute('''
        SELECT
            CASE WHEN from_uid = ? THEN to_uid ELSE from_uid END AS other_uid,
            MAX(created_at) AS last_ts
        FROM messages WHERE from_uid = ? OR to_uid = ?
        GROUP BY other_uid ORDER BY last_ts DESC
    ''', (u['uid'], u['uid'], u['uid'])).fetchall()

    result = []
    for r in rows:
        other = conn.execute("SELECT * FROM users WHERE uid = ?", (r['other_uid'],)).fetchone()
        last_msg = conn.execute('''
            SELECT * FROM messages WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
            ORDER BY created_at DESC LIMIT 1
        ''', (u['uid'], r['other_uid'], r['other_uid'], u['uid'])).fetchone()
        unread = conn.execute(
            "SELECT COUNT(*) c FROM messages WHERE from_uid = ? AND to_uid = ? AND is_read = 0",
            (r['other_uid'], u['uid'])).fetchone()['c']
        if other and last_msg:
            result.append({
                'user': user_to_dict(other),
                'last_message': last_msg['text'],
                'last_from': last_msg['from_uid'],
                'timestamp': last_msg['created_at'] * 1000,
                'unread': unread,
            })
    conn.close()
    return jsonify({'success': True, 'conversations': result})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
