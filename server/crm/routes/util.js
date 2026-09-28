// Utilidades compartidas por las rutas.

/**
 * Envuelve un handler async para que sus rechazos lleguen al error handler de
 * Express.
 *
 * Imprescindible en Express 4: no captura promesas rechazadas, asi que un await
 * que falla (una query caída, un JSON mal formado) deja la peticion colgada
 * hasta que el cliente agota el timeout y, peor, en Node deja el rejection sin
 * manejar. Sin esto, un fallo de MySQL seria un 404 silencioso en vez de un 500.
 *
 * @param {import('express').RequestHandler} fn
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
