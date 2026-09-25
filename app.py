import sqlite3
import os
import random
import string
import time
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'bdxbet_secure_secret_key_2026')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'users.db')


def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def generate_unique_uid(cursor):
    chars = string.ascii_uppercase + string.digits
    for _ in range(50):
        uid = 'LK-' + ''.join(random.choices(chars, k=8))
        cursor.execute("SELECT 1 FROM users WHERE uid = ?", (uid,))
        if not cursor.fetchone():
            return uid
    return 'LK-' + str(int(time.time()))[-8:]


def init_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    c = conn.cursor()

    # Users table
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
            wins INTEGER DEFAULT 0,
            matches INTEGER DEFAULT 0,
            created_at INTEGER
        )
    ''')

    # Safe migration — add missing columns
    migrations = [
        ("users", "uid TEXT"),
        ("users", "name TEXT"),
        ("users", "avatar TEXT DEFAULT '👨‍💼'"),
        ("users", "balance REAL DEFAULT 2500.0"),
        ("users", "vip INTEGER DEFAULT 0"),
        ("users", "wins INTEGER DEFAULT 0"),
        ("users", "matches INTEGER DEFAULT 0"),
        ("users", "created_at INTEGER"),
    ]
    for table, ddl in migrations:
        try:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
        except sqlite3.OperationalError:
            pass

    # Friends table
    c.execute('''
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uid TEXT NOT NULL,
            friend_uid TEXT NOT NULL,
            created_at INTEGER,
            UNIQUE(user_uid, friend_uid)
        )
    ''')

    # Friend requests
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

    # Messages
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

    # Game history
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            game TEXT NOT NULL,
            entry_fee REAL DEFAULT 0,
            prize REAL DEFAULT 0,
            result TEXT,
            created_at INTEGER
        )
    ''')

    # Fix any NULL uid
    try:
        rows = c.execute("SELECT id, phone FROM users WHERE uid IS NULL OR uid = ''").fetchall()
        for r in rows:
            new_uid = generate_unique_uid(c)
            c.execute("UPDATE users SET uid = ? WHERE id = ?", (new_uid, r[0]))
    except Exception:
        pass

    # Fix any NULL balance
    try:
        c.execute("UPDATE users SET balance = 2500.0 WHERE balance IS NULL")
    except Exception:
        pass

    conn.commit()
    conn.close()


init_db()


def current_user():
    phone = session.get('user_phone')
    if not phone:
        return None
    conn = get_db()
    try:
        u = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
        return u
    finally:
        conn.close()


def user_to_dict(u):
    if not u:
        return None
    return {
        'uid': u['uid'],
        'name': u['name'] or f"User {str(u['phone'])[-4:]}",
        'avatar': u['avatar'] or '👨‍💼',
        'coins': float(u['balance'] or 0),
        'balance': float(u['balance'] or 0),
        'vip': int(u['vip'] or 0),
        'phone': u['phone'],
        'wins': int(u['wins'] or 0) if 'wins' in u.keys() else 0,
        'matches': int(u['matches'] or 0) if 'matches' in u.keys() else 0,
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


@app.route('/ludo')
def ludo_game():
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
    try:
        data = request.json or {}
        phone = (data.get('phone') or '').strip()
        password = data.get('password') or ''
        name = (data.get('name') or '').strip()[:20]
        avatar = data.get('avatar') or '👨‍💼'

        if not phone or not password:
            return jsonify({'success': False, 'message': 'ফোন ও পাসওয়ার্ড দিন'})
        if len(password) < 4:
            return jsonify({'success': False, 'message': 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষর'})

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
                    "INSERT INTO users (uid, phone, password, name, avatar, balance, vip, wins, matches, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (uid, phone, hashed, name or None, avatar, 2500.0, 0, 0, 0, int(time.time()))
                )
            conn.commit()
            session.permanent = True
            session['user_phone'] = phone
            return jsonify({'success': True, 'uid': uid, 'message': 'রেজিস্ট্রেশন সফল'})
        except Exception as e:
            conn.rollback()
            return jsonify({'success': False, 'message': str(e)})
        finally:
            conn.close()
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json or {}
        phone = (data.get('phone') or '').strip()
        password = data.get('password') or ''

        if not phone or not password:
            return jsonify({'success': False, 'message': 'ফোন ও পাসওয়ার্ড দিন'})

        conn = get_db()
        u = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
        conn.close()

        if u and check_password_hash(u['password'], password):
            session.permanent = True
            session['user_phone'] = phone
            return jsonify({'success': True, 'user': user_to_dict(u), 'message': 'লগইন সফল'})
        return jsonify({'success': False, 'message': 'ফোন বা পাসওয়ার্ড ভুল'}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


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
    try:
        u = current_user()
        if not u:
            return jsonify({'loggedIn': False})
        return jsonify({'loggedIn': True, **user_to_dict(u)})
    except Exception as e:
        return jsonify({'loggedIn': False, 'error': str(e)})


@app.route('/api/user/update', methods=['POST'])
def update_user():
    try:
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ============================================================
# BALANCE / GAME RESULT API (LUDO এর জন্য দরকার)
# ============================================================
@app.route('/api/user/balance', methods=['POST'])
def update_balance():
    """Ludo game এ কয়েন কাটা/যোগ করার জন্য"""
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False, 'message': 'লগইন করুন'}), 401

        data = request.json or {}
        new_balance = data.get('balance')
        delta = data.get('delta')

        conn = get_db()
        if new_balance is not None:
            conn.execute("UPDATE users SET balance = ? WHERE phone = ?", (float(new_balance), u['phone']))
        elif delta is not None:
            conn.execute("UPDATE users SET balance = balance + ? WHERE phone = ?", (float(delta), u['phone']))
        else:
            conn.close()
            return jsonify({'success': False, 'message': 'balance বা delta দিন'})

        conn.commit()
        fresh = conn.execute("SELECT balance FROM users WHERE phone = ?", (u['phone'],)).fetchone()
        conn.close()
        return jsonify({'success': True, 'balance': float(fresh['balance'])})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/game/result', methods=['POST'])
def game_result():
    """Game win/lose record save করার জন্য"""
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False}), 401

        data = request.json or {}
        game = data.get('game', 'ludo')
        won = bool(data.get('won', False))
        entry_fee = float(data.get('entry_fee', 0))
        prize = float(data.get('prize', 0))

        conn = get_db()
        conn.execute(
            "INSERT INTO game_history (uid, game, entry_fee, prize, result, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (u['uid'], game, entry_fee, prize, 'win' if won else 'lose', int(time.time()))
        )
        conn.execute("UPDATE users SET matches = matches + 1 WHERE phone = ?", (u['phone'],))
        if won:
            conn.execute("UPDATE users SET wins = wins + 1 WHERE phone = ?", (u['phone'],))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ============================================================
# FRIEND API
# ============================================================
@app.route('/api/friend/search', methods=['POST'])
def api_friend_search():
    try:
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/friend/request', methods=['POST'])
def send_friend_request():
    try:
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

        already = conn.execute(
            "SELECT 1 FROM friends WHERE user_uid = ? AND friend_uid = ?",
            (u['uid'], target)
        ).fetchone()
        if already:
            conn.close()
            return jsonify({'success': True, 'status': 'already_friends'})

        reverse = conn.execute(
            "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
            (target, u['uid'])
        ).fetchone()
        if reverse:
            conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (reverse['id'],))
            conn.execute(
                "INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                (u['uid'], target, int(time.time()))
            )
            conn.execute(
                "INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
                (target, u['uid'], int(time.time()))
            )
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/friend/accept', methods=['POST'])
def accept_friend_request():
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False}), 401
        from_uid = ((request.json or {}).get('from_uid') or '').strip().upper()
        conn = get_db()
        req = conn.execute(
            "SELECT id FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'",
            (from_uid, u['uid'])
        ).fetchone()
        if not req:
            conn.close()
            return jsonify({'success': False, 'message': 'রিকোয়েস্ট নেই'})
        conn.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (req['id'],))
        conn.execute(
            "INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
            (u['uid'], from_uid, int(time.time()))
        )
        conn.execute(
            "INSERT OR IGNORE INTO friends (user_uid, friend_uid, created_at) VALUES (?, ?, ?)",
            (from_uid, u['uid'], int(time.time()))
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/friend/reject', methods=['POST'])
def reject_friend_request():
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False}), 401
        from_uid = ((request.json or {}).get('from_uid') or '').strip().upper()
        conn = get_db()
        conn.execute(
            "UPDATE friend_requests SET status = 'rejected' WHERE from_uid = ? AND to_uid = ?",
            (from_uid, u['uid'])
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/friend/list', methods=['GET'])
def friend_list():
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False}), 401
        conn = get_db()
        friends = conn.execute(
            "SELECT u.* FROM friends f JOIN users u ON u.uid = f.friend_uid WHERE f.user_uid = ? ORDER BY f.created_at DESC",
            (u['uid'],)
        ).fetchall()
        incoming = conn.execute(
            "SELECT u.* FROM friend_requests fr JOIN users u ON u.uid = fr.from_uid WHERE fr.to_uid = ? AND fr.status = 'pending'",
            (u['uid'],)
        ).fetchall()
        outgoing = conn.execute(
            "SELECT u.* FROM friend_requests fr JOIN users u ON u.uid = fr.to_uid WHERE fr.from_uid = ? AND fr.status = 'pending'",
            (u['uid'],)
        ).fetchall()
        conn.close()
        return jsonify({
            'success': True,
            'friends': [user_to_dict(x) for x in friends],
            'incoming': [user_to_dict(x) for x in incoming],
            'outgoing': [user_to_dict(x) for x in outgoing],
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ============================================================
# CHAT API
# ============================================================
@app.route('/api/messages/send', methods=['POST'])
def send_message():
    try:
        u = current_user()
        if not u:
            return jsonify({'success': False}), 401
        data = request.json or {}
        to_uid = (data.get('to_uid') or '').strip().upper()
        text = (data.get('text') or '').strip()[:500]
        if not to_uid or not text:
            return jsonify({'success': False})
        conn = get_db()
        conn.execute(
            "INSERT INTO messages (from_uid, to_uid, text, created_at) VALUES (?, ?, ?, ?)",
            (u['uid'], to_uid, text, int(time.time()))
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/messages/list', methods=['POST'])
def list_messages():
    try:
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
        conn.execute(
            "UPDATE messages SET is_read = 1 WHERE from_uid = ? AND to_uid = ?",
            (other, u['uid'])
        )
        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'messages': [
                {
                    'id': r['id'],
                    'from': r['from_uid'],
                    'text': r['text'],
                    'timestamp': r['created_at'] * 1000
                }
                for r in rows
            ]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/messages/inbox', methods=['GET'])
def inbox():
    try:
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ============================================================
# HEALTH CHECK
# ============================================================
@app.route('/healthz')
def healthz():
    return jsonify({'status': 'ok', 'time': int(time.time())})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
