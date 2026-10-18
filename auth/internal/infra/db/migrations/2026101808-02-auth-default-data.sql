-- +migrate Up
-- Seed accounts, roles, user groups and other non-catalog defaults.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', 'KQ2CKDF6'),
    (2, 'Guest', 'guest', 'VT4YX7XN'),
    (3, 'Admin', 'admin', 'Q4NEEXVG,VT4YX7XN,57VGBNEW,CEBTAGTL,GF7SA34M,T777XDYF,PNA8WWNP,V3P4AK2Q,KSD89P5H,W94GCP9F,H8B2TJT4,MQL48MQC,W586442Q,LT2WHSEA,KPFJ3BDV,22MK9ETF,ASYRTQ4W,T3RT8T5H,3SSXLNXW,WCM45YKN,YJAPCRVN,NWQGYBF2,SBYKFQVR,SERP63H6,WGQTYCXM'),
    (4, 'Developer', 'developer', 'Q4NEEXVG,VT4YX7XN,57VGBNEW,CEBTAGTL,GF7SA34M,T777XDYF,PNA8WWNP,V3P4AK2Q,KSD89P5H,W94GCP9F,H8B2TJT4,MQL48MQC,W586442Q,LT2WHSEA,KPFJ3BDV,22MK9ETF,ASYRTQ4W,T3RT8T5H,MCPK2MT4,X73CBNQP,39NFCKVJ,CMT9S6FG,3SSXLNXW,WCM45YKN,YJAPCRVN,NWQGYBF2,SBYKFQVR,SERP63H6,WGQTYCXM,E3J5VW9V'),
    (5, 'Operator', 'operator', 'Q4NEEXVG,SERP63H6');

INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', '57VGBNEW,PNA8WWNP,H8B2TJT4,KPFJ3BDV'),
    (2, 'Read Write', 'write', '57VGBNEW,CEBTAGTL,GF7SA34M,T777XDYF,PNA8WWNP,V3P4AK2Q,KSD89P5H,W94GCP9F,H8B2TJT4,MQL48MQC,W586442Q,LT2WHSEA,KPFJ3BDV,22MK9ETF,ASYRTQ4W,T3RT8T5H'),
    (3, 'No Delete', 'nodelete', '57VGBNEW,CEBTAGTL,GF7SA34M,PNA8WWNP,V3P4AK2Q,KSD89P5H,H8B2TJT4,MQL48MQC,W586442Q,KPFJ3BDV,22MK9ETF,ASYRTQ4W');

-- Local seed credentials intentionally use the username as the password.
INSERT INTO t_user (id, role_id, username, code, password, status) VALUES
    (1, 1, 'super', '666FEJVD', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1),
    (2, 2, 'guest', '6E74XL4S', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1),
    (3, NULL, 'readonly', '9DH578EW', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1),
    (4, NULL, 'write', 'BAPNY3GL', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1),
    (5, NULL, 'nodelete', 'RFV3HSBB', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1),
    (6, 3, 'admin', '2DKBBA4J', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1),
    (7, 4, 'developer', 'V43LCWD4', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1),
    (8, 5, 'operator', 'NF8PVSMD', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1);

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
