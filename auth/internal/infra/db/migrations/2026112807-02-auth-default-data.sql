-- +migrate Up
-- Required super account and role in both seed modes.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', '8E96SXKE');

-- The initial super password is super.
INSERT INTO t_user (id, role_id, username, code, password, status, action) VALUES
    (1, 1, 'super', '6WWWCFYN', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1, '36F38EXK');

-- Additional example identities are included only when only_super=false.
INSERT INTO t_role (id, name, word, action) VALUES
    (2, 'Guest', 'guest', 'E68P9W8X'),
    (3, 'Admin', 'admin', '36F38EXK,E68P9W8X,KK28WTLR,VXSWT98B,FC5VEX68,3PLNSENX,NB36T9XL,FEFP5Q52,NP2VD4DS,C3PWN6NQ,T9FW3BF3,837FL9DG,G88NDWPM,MWESY587,VKQXHKQY,F6DDVXR3,SH2GRJYR,AS85JDV3,XSEYS5R3,W634D6N6,Y6D4KBC4,9N8X8JRY,V3XBBJ6F,TSPSQ3SB,K5G2PA2W'),
    (4, 'Developer', 'developer', '36F38EXK,E68P9W8X,KK28WTLR,VXSWT98B,FC5VEX68,3PLNSENX,NB36T9XL,FEFP5Q52,NP2VD4DS,C3PWN6NQ,T9FW3BF3,837FL9DG,G88NDWPM,MWESY587,VKQXHKQY,F6DDVXR3,SH2GRJYR,AS85JDV3,MALK6AL9,JXHCLCP9,4GDAPR63,EAH8GLRN,XSEYS5R3,W634D6N6,Y6D4KBC4,9N8X8JRY,V3XBBJ6F,TSPSQ3SB,K5G2PA2W,YCJ6LQEN'),
    (5, 'Operator', 'operator', '36F38EXK,TSPSQ3SB');

-- Demo groups cover all ordinary admin pages, including workspace, dictionaries,
-- message management and both audit pages. Developer/catalog publishing remains
-- a separate capability of the Developer role, never implied by a demo tier.
-- Read Only: read. Read Write: read/create/update/delete. No Delete: read/create/update.
-- Personal account, inbox and session defaults remain assigned directly below.
INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', 'E68P9W8X,TSPSQ3SB,KK28WTLR,NB36T9XL,T9FW3BF3,VKQXHKQY,MALK6AL9,XSEYS5R3,9N8X8JRY,V3XBBJ6F'),
    (2, 'Read Write', 'write', 'E68P9W8X,TSPSQ3SB,KK28WTLR,VXSWT98B,FC5VEX68,3PLNSENX,NB36T9XL,FEFP5Q52,NP2VD4DS,C3PWN6NQ,T9FW3BF3,837FL9DG,G88NDWPM,MWESY587,VKQXHKQY,F6DDVXR3,SH2GRJYR,AS85JDV3,MALK6AL9,JXHCLCP9,4GDAPR63,EAH8GLRN,XSEYS5R3,W634D6N6,Y6D4KBC4,9N8X8JRY,V3XBBJ6F'),
    (3, 'No Delete', 'nodelete', 'E68P9W8X,TSPSQ3SB,KK28WTLR,VXSWT98B,FC5VEX68,NB36T9XL,FEFP5Q52,NP2VD4DS,T9FW3BF3,837FL9DG,G88NDWPM,VKQXHKQY,F6DDVXR3,SH2GRJYR,MALK6AL9,JXHCLCP9,4GDAPR63,XSEYS5R3,W634D6N6,9N8X8JRY,V3XBBJ6F');

-- Local seed credentials intentionally use the username as the password.
INSERT INTO t_user (id, role_id, username, code, password, status, action) VALUES
    (2, 2, 'guest', '4NQGW2RK', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1, '36F38EXK'),
    (3, NULL, 'readonly', 'NTDXXAT8', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1, '36F38EXK'),
    (4, NULL, 'write', 'TMG4W945', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1, '36F38EXK'),
    (5, NULL, 'nodelete', 'HB7N49YA', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1, '36F38EXK'),
    (6, 3, 'admin', 'DH3VRNPB', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1, '36F38EXK'),
    (7, 4, 'developer', '97FJ9RWM', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1, '36F38EXK'),
    (8, 5, 'operator', '5TW27QFG', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1, '36F38EXK');

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
-- Undo only the tables seeded above. DELETE avoids requiring every table
-- referencing t_user to participate in a TRUNCATE.
DELETE FROM t_user_msg_status;

DELETE FROM t_user_user_group_relation;

DELETE FROM t_user;

DELETE FROM t_user_group;

DELETE FROM t_role;

SELECT setval(pg_get_serial_sequence('t_user_msg_status', 'id'), 1, FALSE);
SELECT setval(pg_get_serial_sequence('t_user_user_group_relation', 'id'), 1, FALSE);
SELECT setval(pg_get_serial_sequence('t_user_group', 'id'), 1, FALSE);
SELECT setval(pg_get_serial_sequence('t_user', 'id'), 1, FALSE);
SELECT setval(pg_get_serial_sequence('t_role', 'id'), 1, FALSE);
