-- +migrate Up
-- Seed accounts, roles, user groups and other non-catalog defaults.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', '93747EHX'),
    (2, 'Guest', 'guest', 'BVXDD77E'),
    (3, 'Admin', 'admin', 'SV3LH27F,BVXDD77E,FR5555S6,686GAV6L,QECC9KGF,YKF387VK,DCWDKY4C,8E7LEDSD,TK2GA8PK,EVHB868B,QJEL5YKV,AT9Q6TL2,8XMHTS4V,8C2CY8VR,8AYHF4DS,C3AS6HK7,B94KYJWP,9XX58LSR,JKEM8DBN,VTYYA9BB,XBJ8T7SG,2C4AT7QV,5TR3NN5D,RBBYJQWQ,PLK4EXWV'),
    (4, 'Developer', 'developer', 'SV3LH27F,BVXDD77E,FR5555S6,686GAV6L,QECC9KGF,YKF387VK,DCWDKY4C,8E7LEDSD,TK2GA8PK,EVHB868B,QJEL5YKV,AT9Q6TL2,8XMHTS4V,8C2CY8VR,8AYHF4DS,C3AS6HK7,B94KYJWP,9XX58LSR,F2P4BK5R,PD58JJLA,JW9SL7DE,RFBP8W8B,JKEM8DBN,VTYYA9BB,XBJ8T7SG,2C4AT7QV,5TR3NN5D,RBBYJQWQ,PLK4EXWV,MLRB79NH'),
    (5, 'Operator', 'operator', 'SV3LH27F,RBBYJQWQ');

INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', 'FR5555S6,DCWDKY4C,QJEL5YKV,8AYHF4DS'),
    (2, 'Read Write', 'write', 'FR5555S6,686GAV6L,QECC9KGF,YKF387VK,DCWDKY4C,8E7LEDSD,TK2GA8PK,EVHB868B,QJEL5YKV,AT9Q6TL2,8XMHTS4V,8C2CY8VR,8AYHF4DS,C3AS6HK7,B94KYJWP,9XX58LSR'),
    (3, 'No Delete', 'nodelete', 'FR5555S6,686GAV6L,QECC9KGF,DCWDKY4C,8E7LEDSD,TK2GA8PK,QJEL5YKV,AT9Q6TL2,8XMHTS4V,8AYHF4DS,C3AS6HK7,B94KYJWP');

-- Local seed credentials intentionally use the username as the password.
-- Preserve the finalized seed accounts; group defaults only affect future creation.
INSERT INTO t_user (id, role_id, username, code, password, status, action) VALUES
    (1, 1, 'super', '46PGN6EN', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1, 'SV3LH27F'),
    (2, 2, 'guest', '456PW8D2', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1, 'SV3LH27F'),
    (3, NULL, 'readonly', 'MSD2TCM6', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1, 'SV3LH27F'),
    (4, NULL, 'write', 'Q488PVQC', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1, 'SV3LH27F'),
    (5, NULL, 'nodelete', 'ENB7XM8B', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1, 'SV3LH27F'),
    (6, 3, 'admin', 'A9CHDBMC', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1, 'SV3LH27F'),
    (7, 4, 'developer', 'DH7JHBQB', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1, 'SV3LH27F'),
    (8, 5, 'operator', 'B6CKGNWR', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1, 'SV3LH27F');

INSERT INTO t_user_user_group_relation (user_id, user_group_id) VALUES
    (3, 1),
    (4, 2),
    (5, 3);

-- A fresh schema has no messages; initialize zero-count statistics for seed users.
INSERT INTO t_user_msg_status (user_id)
SELECT id
FROM t_user
ORDER BY id;

SELECT setval(pg_get_serial_sequence('t_role', 'id'), (SELECT MAX(id) FROM t_role), TRUE);
SELECT setval(pg_get_serial_sequence('t_user_group', 'id'), (SELECT MAX(id) FROM t_user_group), TRUE);
SELECT setval(pg_get_serial_sequence('t_user', 'id'), (SELECT MAX(id) FROM t_user), TRUE);

-- +migrate Down
-- Clear the non-catalog auth tables and reset their sequences.
TRUNCATE TABLE
    t_audit_event,
    t_user_msg_status,
    t_msg_recipient,
    t_msg,
    t_user_user_group_relation,
    t_user,
    t_user_group,
    t_role
RESTART IDENTITY;
