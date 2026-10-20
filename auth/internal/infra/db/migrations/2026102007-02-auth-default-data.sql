-- +migrate Up
-- Seed accounts, roles, user groups and other non-catalog defaults.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', 'AY32HK37'),
    (2, 'Guest', 'guest', 'CB4HYBEJ'),
    (3, 'Admin', 'admin', '5JKGRJMC,CB4HYBEJ,9RYW26YJ,VTY6EAVN,77G683AH,EHBP9LD4,XDSWTHAA,NH2GBG9R,HK4ECPGT,P2GGF7HM,P5C8EY3J,7Y2M6JT9,G9HC36QN,8HM75GSY,SGGWLXEV,W3BVFF2D,78K9QWCP,H73QA8PY,GE6R7MTV,HPXHQGS9,DP9DVALL,TJM6R659,QDP9DXHB,KQB3MCFA,8ERXG2K4'),
    (4, 'Developer', 'developer', '5JKGRJMC,CB4HYBEJ,9RYW26YJ,VTY6EAVN,77G683AH,EHBP9LD4,XDSWTHAA,NH2GBG9R,HK4ECPGT,P2GGF7HM,P5C8EY3J,7Y2M6JT9,G9HC36QN,8HM75GSY,SGGWLXEV,W3BVFF2D,78K9QWCP,H73QA8PY,Q8P69K6D,89SL8RER,797KBVC2,M692J9Y8,GE6R7MTV,HPXHQGS9,DP9DVALL,TJM6R659,QDP9DXHB,KQB3MCFA,8ERXG2K4,GS2SD7HS'),
    (5, 'Operator', 'operator', '5JKGRJMC,KQB3MCFA');

-- Demo groups cover all ordinary admin pages, including workspace, dictionaries,
-- message management and both audit pages. Developer/catalog publishing remains
-- a separate capability of the Developer role, never implied by a demo tier.
-- Read Only: read. Read Write: read/create/update/delete. No Delete: read/create/update.
-- Personal account, inbox and session defaults remain assigned directly below.
INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', 'CB4HYBEJ,KQB3MCFA,9RYW26YJ,XDSWTHAA,P5C8EY3J,SGGWLXEV,Q8P69K6D,GE6R7MTV,TJM6R659,QDP9DXHB'),
    (2, 'Read Write', 'write', 'CB4HYBEJ,KQB3MCFA,9RYW26YJ,VTY6EAVN,77G683AH,EHBP9LD4,XDSWTHAA,NH2GBG9R,HK4ECPGT,P2GGF7HM,P5C8EY3J,7Y2M6JT9,G9HC36QN,8HM75GSY,SGGWLXEV,W3BVFF2D,78K9QWCP,H73QA8PY,Q8P69K6D,89SL8RER,797KBVC2,M692J9Y8,GE6R7MTV,HPXHQGS9,DP9DVALL,TJM6R659,QDP9DXHB'),
    (3, 'No Delete', 'nodelete', 'CB4HYBEJ,KQB3MCFA,9RYW26YJ,VTY6EAVN,77G683AH,XDSWTHAA,NH2GBG9R,HK4ECPGT,P5C8EY3J,7Y2M6JT9,G9HC36QN,SGGWLXEV,W3BVFF2D,78K9QWCP,Q8P69K6D,89SL8RER,797KBVC2,GE6R7MTV,HPXHQGS9,TJM6R659,QDP9DXHB');

-- Local seed credentials intentionally use the username as the password.
-- Preserve the finalized seed accounts; group defaults only affect future creation.
INSERT INTO t_user (id, role_id, username, code, password, status, action) VALUES
    (1, 1, 'super', 'RLM742EC', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1, '5JKGRJMC'),
    (2, 2, 'guest', '35WBYYLF', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1, '5JKGRJMC'),
    (3, NULL, 'readonly', '9VBRF68T', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1, '5JKGRJMC'),
    (4, NULL, 'write', 'FKV8A54E', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1, '5JKGRJMC'),
    (5, NULL, 'nodelete', 'PQH42QXK', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1, '5JKGRJMC'),
    (6, 3, 'admin', 'HJ66XJWH', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1, '5JKGRJMC'),
    (7, 4, 'developer', 'MQVH8CX2', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1, '5JKGRJMC'),
    (8, 5, 'operator', 'WESCFW24', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1, '5JKGRJMC');

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
