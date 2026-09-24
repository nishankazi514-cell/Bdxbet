import sqlite3
import os
import random
import string
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'bdxbet_secure_secret_key_2026')
DB_FILE = 'users.db'


# ============================================================
# DATABASE HELPERS
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
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    ''')

    # ---- migrations (পুরনো DB-তে column যোগ করার জন্য) ----
    for ddl in [
        "ALTER TABLE users ADD COLUMN uid TEXT",
        "ALTER TABLE users ADD COLUMN name TEXT",
        "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '👨‍💼'",
        "ALTER TABLE users ADD COLUMN created_at INTEGER",
    ]:
        try: c.execute(ddl)
        except sqlite3.OperationalError: pass

    # ---- friends ----
    c.execute('''
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uid TEXT NOT NULL,
            friend_uid TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            UNIQUE(user_uid, friend_uid)
        )
    ''')

    # ---- friend_requests ----
    c.execute('''
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_uid TEXT NOT NULL,
            to_uid TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s','now')),
            UNIQUE(from_uid, to_uid)
        )
    ''')

    # ---- messages ----
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_uid TEXT NOT NULL,
            to_uid TEXT NOT NULL,
            text TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    ''')

    # ---- rooms ----
    c.execute('''
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT UNIQUE NOT NULL,
            creator_uid TEXT NOT NULL,
            mode TEXT NOT NULL,
            coin_amount REAL NOT NULL,
            max_players INTEGER NOT NULL,
            status TEXT DEFAULT 'waiting',
            players TEXT DEFAULT '[]',
            created_at INTEGER DEFAULT (strftime('%s','now')),
            expires_at INTEGER
        )
    ''')

    conn.commit()
    conn.close()


init_db()


# ============================================================
# AUTH HELPERS
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
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('index.html')


@app.route('/login')
def login_page():
    if session.get('user_phone'):
        return redirect(url_for('home'))
    return render_template('login.html')


@app.route('/speed-tap')
def speed_tap():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('Speedtap.html')


@app.route('/ludo')
def ludo_game():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('ludo.html')


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
            c.execute(
                "UPDATE users SET password = ?, uid = ?, name = ?, avatar = ? WHERE phone = ?",
                (hashed, uid, name or None, avatar, phone)
            )
        else:
            uid = generate_unique_uid(c)
            c.execute(
                "INSERT INTO users (uid, phone, password, name, avatar, balance, vip) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uid, phone, hashed, name or None, avatar, 2500.0, 0)
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
        return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

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
# FRIEND SYSTEM
# ============================================================
@app.route('/api/friend/search', methods=['POST'])
def api_friend_search():
    u = current_user()
    if not u:
        return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

    data = request.json or {}
    q = (data.get('uid') or '').strip().upper()
    if not q:
        return jsonify({'success': False, 'message': 'UID দিন'})

    # "LK-" ছাড়া দিলে যোগ করে দিন
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
        return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

    target_uid = (request.json or {}).get('target_uid', '').strip().upper()
    if not target_uid or target_uid == u['uid']:
        return jsonify({'success': False, 'message': 'ভুল UID'})

    conn = get_db()
    other = conn.execute("SELECT * FROM users WHERE uid = ?", (target_uid,)).fetchone()
    if not other:
        conn.close()
        return jsonify({'success': False, 'message': 'ইউজার নেই'})

    # আগে থেকে বন্ধু কিনা?
    already = conn.execute(
        "SELECT 1 FROM friends WHERE user_uid = ? AND friend_uid = ?",
        (u['uid'], target_uid)
    ).fetchone()
    if already:
        conn.close()
        return jsonify({'success': True, 'status': 'already_friends'})

    # উল্টো দিক থেকে pending request আছে? তাহলে accept করে ফেলি
    reverse = conn.execute(
        "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
        (target_uid, u['uid'])
    ).fetchone()

    if reverse:
        conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (reverse['id'],))
        conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid) VALUES (?, ?)", (u['uid'], target_uid))
        conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid) VALUES (?, ?)", (target_uid, u['uid']))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'status': 'became_friends'})

    # নতুন request পাঠাই
    conn.execute(
        "INSERT OR REPLACE INTO friend_requests (from_uid, to_uid, status) VALUES (?, ?, 'pending')",
        (u['uid'], target_uid)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'status': 'request_sent'})


@app.route('/api/friend/accept', methods=['POST'])
def accept_friend_request():
    u = current_user()
    if not u:
        return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

    from_uid = (request.json or {}).get('from_uid', '').strip().upper()
    conn = get_db()
    req = conn.execute(
        "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
        (from_uid, u['uid'])
    ).fetchone()
    if not req:
        conn.close()
        return jsonify({'success': False, 'message': 'রিকোয়েস্ট নেই'})

    conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (req['id'],))
    conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid) VALUES (?, ?)", (u['uid'], from_uid))
    conn.execute("INSERT OR IGNORE INTO friends (user_uid, friend_uid) VALUES (?, ?)", (from_uid, u['uid']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/friend/reject', methods=['POST'])
def reject_friend_request():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    from_uid = (request.json or {}).get('from_uid', '').strip().upper()
    conn = get_db()
    conn.execute(
        "UPDATE friend_requests SET status = 'rejected' WHERE from_uid = ? AND to_uid = ?",
        (from_uid, u['uid'])
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/friend/list', methods=['GET'])
def friend_list():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401

    conn = get_db()
    rows = conn.execute('''
        SELECT u.* FROM friends f
        JOIN users u ON u.uid = f.friend_uid
        WHERE f.user_uid = ?
    ''', (u['uid'],)).fetchall()

    incoming = conn.execute('''
        SELECT u.* FROM friend_requests fr
        JOIN users u ON u.uid = fr.from_uid
        WHERE fr.to_uid = ? AND fr.status = 'pending'
    ''', (u['uid'],)).fetchall()

    outgoing = conn.execute('''
        SELECT u.* FROM friend_requests fr
        JOIN users u ON u.uid = fr.to_uid
        WHERE fr.from_uid = ? AND fr.status = 'pending'
    ''', (u['uid'],)).fetchall()

    conn.close()
    return jsonify({
        'success': True,
        'friends': [user_to_dict(x) for x in rows],
        'incoming': [user_to_dict(x) for x in incoming],
        'outgoing': [user_to_dict(x) for x in outgoing],
    })


# ============================================================
# CHAT / MESSAGES
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
        return jsonify({'success': False, 'message': 'ভুল ডেটা'})

    conn = get_db()
    conn.execute(
        "INSERT INTO messages (from_uid, to_uid, text) VALUES (?, ?, ?)",
        (u['uid'], to_uid, text)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/messages/list', methods=['POST'])
def list_messages():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    other = (request.json or {}).get('with_uid', '').strip().upper()
    if not other:
        return jsonify({'success': False})

    conn = get_db()
    rows = conn.execute('''
        SELECT * FROM messages
        WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
        ORDER BY created_at ASC LIMIT 200
    ''', (u['uid'], other, other, u['uid'])).fetchall()

    conn.execute("UPDATE messages SET is_read = 1 WHERE from_uid = ? AND to_uid = ?",
                 (other, u['uid']))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'messages': [
            {'id': r['id'], 'from': r['from_uid'], 'text': r['text'],
             'timestamp': r['created_at'] * 1000}
            for r in rows
        ]
    })


@app.route('/api/messages/inbox', methods=['GET'])
def inbox():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401

    conn = get_db()
    # প্রতিটা conversaion-এর শেষ মেসেজ
    rows = conn.execute('''
        SELECT
            CASE WHEN from_uid = ? THEN to_uid ELSE from_uid END AS other_uid,
            MAX(created_at) AS last_ts
        FROM messages
        WHERE from_uid = ? OR to_uid = ?
        GROUP BY other_uid
        ORDER BY last_ts DESC
    ''', (u['uid'], u['uid'], u['uid'])).fetchall()

    result = []
    for r in rows:
        other = conn.execute("SELECT * FROM users WHERE uid = ?", (r['other_uid'],)).fetchone()
        last_msg = conn.execute('''
            SELECT * FROM messages
            WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
            ORDER BY created_at DESC LIMIT 1
        ''', (u['uid'], r['other_uid'], r['other_uid'], u['uid'])).fetchone()
        unread = conn.execute(
            "SELECT COUNT(*) c FROM messages WHERE from_uid = ? AND to_uid = ? AND is_read = 0",
            (r['other_uid'], u['uid'])
        ).fetchone()['c']
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


# ============================================================
# ROOMS (Live Multiplayer)
# ============================================================
import json as _json

@app.route('/api/rooms/list', methods=['GET'])
def rooms_list():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    now = int(__import__('time').time())
    conn = get_db()
    # expired room বাদ দিই
    conn.execute("DELETE FROM rooms WHERE status = 'waiting' AND expires_at < ?", (now,))
    conn.commit()
    rows = conn.execute("SELECT * FROM rooms WHERE status = 'waiting' ORDER BY created_at DESC").fetchall()
    rooms = []
    for r in rows:
        creator = conn.execute("SELECT * FROM users WHERE uid = ?", (r['creator_uid'],)).fetchone()
        rooms.append({
            'room_code': r['room_code'],
            'mode': r['mode'],
            'coin_amount': r['coin_amount'],
            'max_players': r['max_players'],
            'players': _json.loads(r['players'] or '[]'),
            'creator': user_to_dict(creator),
            'expires_at': r['expires_at'] * 1000,
        })
    conn.close()
    return jsonify({'success': True, 'rooms': rooms})


@app.route('/api/rooms/create', methods=['POST'])
def rooms_create():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    data = request.json or {}
    mode = data.get('mode', '1v1')
    amount = float(data.get('amount', 100))

    if amount < 10:
        return jsonify({'success': False, 'message': 'সর্বনিম্ন ১০ কয়েন'})
    if u['balance'] < amount:
        return jsonify({'success': False, 'message': 'ব্যালেন্স কম'})

    max_players = 2 if mode == '1v1' else 4
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    now = int(__import__('time').time())

    conn = get_db()
    conn.execute("UPDATE users SET balance = balance - ? WHERE uid = ?", (amount, u['uid']))
    conn.execute('''
        INSERT INTO rooms (room_code, creator_uid, mode, coin_amount, max_players, players, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (code, u['uid'], mode, amount, max_players,
          _json.dumps([{'uid': u['uid'], 'name': u['name'], 'avatar': u['avatar']}]),
          now + 600))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'room_code': code})


@app.route('/api/rooms/join', methods=['POST'])
def rooms_join():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    code = (request.json or {}).get('room_code', '').strip().upper()

    conn = get_db()
    room = conn.execute("SELECT * FROM rooms WHERE room_code = ? AND status = 'waiting'", (code,)).fetchone()
    if not room:
        conn.close()
        return jsonify({'success': False, 'message': 'রুম নেই বা বন্ধ'})

    players = _json.loads(room['players'] or '[]')
    if any(p['uid'] == u['uid'] for p in players):
        conn.close()
        return jsonify({'success': False, 'message': 'আপনি ইতিমধ্যে এই রুমে'})
    if len(players) >= room['max_players']:
        conn.close()
        return jsonify({'success': False, 'message': 'রুম ভরা'})
    if u['balance'] < room['coin_amount']:
        conn.close()
        return jsonify({'success': False, 'message': 'ব্যালেন্স কম'})

    conn.execute("UPDATE users SET balance = balance - ? WHERE uid = ?", (room['coin_amount'], u['uid']))
    players.append({'uid': u['uid'], 'name': u['name'], 'avatar': u['avatar']})

    new_status = 'full' if len(players) >= room['max_players'] else 'waiting'
    conn.execute("UPDATE rooms SET players = ?, status = ? WHERE id = ?",
                 (_json.dumps(players), new_status, room['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'status': new_status, 'players': players})


@app.route('/api/rooms/cancel', methods=['POST'])
def rooms_cancel():
    u = current_user()
    if not u:
        return jsonify({'success': False}), 401
    code = (request.json or {}).get('room_code', '').strip().upper()

    conn = get_db()
    room = conn.execute("SELECT * FROM rooms WHERE room_code = ? AND status = 'waiting'", (code,)).fetchone()
    if not room or room['creator_uid'] != u['uid']:
        conn.close()
        return jsonify({'success': False})

    players = _json.loads(room['players'] or '[]')
    for p in players:
        conn.execute("UPDATE users SET balance = balance + ? WHERE uid = ?",
                     (room['coin_amount'], p['uid']))
    conn.execute("UPDATE rooms SET status = 'cancelled' WHERE id = ?", (room['id'],))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
