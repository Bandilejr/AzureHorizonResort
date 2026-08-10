/**
 * Public key used to verify server-issued room JWTs (RS256).
 *
 * The matching private key lives ONLY on the backend (JWT_PRIVATE_KEY in
 * functions/.env or Cloud Secret Manager). The mobile app never contains a
 * private signing key.
 */
export const SERVER_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArAEM9XBeIyZ6JqAN4AHV
xSql5UjQdAXlO+kf29h0EQd2di8skKXvYCV6O2t1WvHRTbM3jSvlE5dK7rD2CQfb
eQchY1da6R7WJGBwOIICOQ+IxWCNJVjqW7139U5AXQ7yhAWE1IqO5kUqB94jSntV
uTMH4gxwmm4wAJCS2vMvhcc66M8TK2BGdohpKdzbv8VZYIj6i776UUOqEpQB1hZa
bl8T9ayjCCHaUdO2nQ34xf0f8OErtnlwsOD2l88JcL2DDvj/2zrWdus1twlfH37o
Wf4ThnWgxL/0Q98Wg5uheXiGswbfU84eWc+czvQnzB5FV4eXZtzMcJuhsnzeedE8
OQIDAQAB
-----END PUBLIC KEY-----`;
