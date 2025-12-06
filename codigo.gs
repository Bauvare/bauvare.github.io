function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Bauware Store')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function testConnection() {
  return { success: true, message: "✅ Conectado a Bauware", time: new Date() };
}

function getDashboard() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboard = ss.getSheetByName('📊 DASHBOARD');
    
    if (!dashboard) return { error: "No dashboard" };
    
    return {
      ventasHoy: dashboard.getRange('B4').getValue() || 0,
      ventasMes: dashboard.getRange('B5').getValue() || 0,
      stockBajo: dashboard.getRange('B7').getValue() || 0,
      valorInventario: dashboard.getRange('B8').getValue() || 0,
      lotesActivos: dashboard.getRange('B6').getValue() || 0
    };
  } catch (e) {
    return { error: e.toString() };
  }
}

function getProductos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('👗 CATALOGO');
    
    if (!sheet) return { productos: [] };
    
    const data = sheet.getDataRange().getValues();
    const productos = [];
    
    for (let i = 1; i < data.length; i++) {
      productos.push({
        id: data[i][0] || '',
        nombre: data[i][1] || '',
        talla: data[i][3] || '',
        color: data[i][4] || '',
        precio: data[i][6] || 0,
        stock: data[i][7] || 0
      });
    }
    
    return { productos: productos };
  } catch (e) {
    return { error: e.toString() };
  }
}
// ============ FUNCIONES PARA VENDER ============

function venderProducto(ventaData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ventasSheet = ss.getSheetByName('🛒 VENTAS');
    
    if (!ventasSheet) return { error: 'Hoja de ventas no encontrada' };
    
    // Generar ID
    const lastRow = ventasSheet.getLastRow();
    let nuevoId = 'V1010';
    if (lastRow > 1) {
      const lastId = ventasSheet.getRange(lastRow, 2).getValue();
      if (lastId && lastId.toString().startsWith('V')) {
        const num = parseInt(lastId.substring(1)) + 1;
        nuevoId = 'V' + num;
      }
    }
    
    // Calcular total
    const total = ventaData.cantidad * ventaData.precio;
    
    // Agregar fila a ventas
    ventasSheet.appendRow([
      new Date(),
      nuevoId,
      ventaData.productoNombre,
      ventaData.talla,
      ventaData.color,
      ventaData.cantidad,
      ventaData.precio,
      total,
      ventaData.metodoPago || 'EFECTIVO'
    ]);
    
    // Actualizar stock en catálogo
    const catalogoSheet = ss.getSheetByName('👗 CATALOGO');
    if (catalogoSheet) {
      const catalogoData = catalogoSheet.getDataRange().getValues();
      
      for (let i = 1; i < catalogoData.length; i++) {
        if (catalogoData[i][1] === ventaData.productoNombre && 
            catalogoData[i][3] === ventaData.talla && 
            catalogoData[i][4] === ventaData.color) {
          
          const stockActual = Number(catalogoData[i][7]) || 0;
          const nuevoStock = stockActual - ventaData.cantidad;
          
          if (nuevoStock >= 0) {
            catalogoSheet.getRange(i + 1, 8).setValue(nuevoStock);
            
            // También actualizar inventario automáticamente
            actualizarInventario();
            
            return {
              success: true,
              ventaId: nuevoId,
              total: total,
              nuevoStock: nuevoStock,
              message: `✅ Venta ${nuevoId} registrada - Total: S/ ${total.toFixed(2)}`
            };
          } else {
            return { error: '❌ Stock insuficiente' };
          }
        }
      }
    }
    
    return {
      success: true,
      ventaId: nuevoId,
      total: total,
      message: `✅ Venta ${nuevoId} registrada - Total: S/ ${total.toFixed(2)}`
    };
    
  } catch (error) {
    return { error: error.toString() };
  }
}

// Actualizar inventario automáticamente
function actualizarInventario() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const catalogoSheet = ss.getSheetByName('👗 CATALOGO');
    const inventarioSheet = ss.getSheetByName('📦 INVENTARIO');
    const ventasSheet = ss.getSheetByName('🛒 VENTAS');
    
    if (!catalogoSheet || !inventarioSheet || !ventasSheet) return;
    
    // Obtener ventas por producto
    const ventasData = ventasSheet.getDataRange().getValues();
    const ventasPorProducto = {};
    
    for (let i = 1; i < ventasData.length; i++) {
      const producto = ventasData[i][2]; // Columna C
      const talla = ventasData[i][3];    // Columna D
      const color = ventasData[i][4];    // Columna E
      const cantidad = Number(ventasData[i][5]) || 0; // Columna F
      
      const key = `${producto}|${talla}|${color}`;
      ventasPorProducto[key] = (ventasPorProducto[key] || 0) + cantidad;
    }
    
    // Obtener catálogo
    const catalogoData = catalogoSheet.getDataRange().getValues();
    
    // Limpiar y actualizar inventario
    inventarioSheet.clearContents();
    
    // Encabezados
    inventarioSheet.getRange(1, 1, 1, 7).setValues([[
      'PRODUCTO', 'TALLA', 'COLOR', 'STOCK_INICIAL', 'VENTAS', 'STOCK_ACTUAL', 'ALERTA'
    ]]);
    
    let row = 2;
    for (let i = 1; i < catalogoData.length; i++) {
      const producto = catalogoData[i][1];
      const talla = catalogoData[i][3];
      const color = catalogoData[i][4];
      const stockInicial = Number(catalogoData[i][7]) || 0;
      
      const key = `${producto}|${talla}|${color}`;
      const ventas = ventasPorProducto[key] || 0;
      const stockActual = stockInicial - ventas;
      
      let alerta = '✅ NORMAL';
      if (stockActual < 5) {
        alerta = '🔴 URGENTE';
      } else if (stockActual < 10) {
        alerta = '🟡 BAJO';
      }
      
      inventarioSheet.getRange(row, 1, 1, 7).setValues([[
        producto, talla, color, stockInicial, ventas, stockActual, alerta
      ]]);
      
      row++;
    }
    
    return { success: true, message: 'Inventario actualizado' };
  } catch (error) {
    return { error: error.toString() };
  }
}

// ============ FUNCIONES PARA AGREGAR PRODUCTO ============

function agregarProducto(productoData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('👗 CATALOGO');
    
    if (!sheet) return { error: 'Hoja de catálogo no encontrada' };
    
    // Generar ID
    const lastRow = sheet.getLastRow();
    let nuevoId = 'PROD-001';
    if (lastRow > 1) {
      const lastId = sheet.getRange(lastRow, 1).getValue();
      if (lastId && lastId.includes('-')) {
        const num = parseInt(lastId.split('-')[1]) + 1;
        nuevoId = 'PROD-' + num.toString().padStart(3, '0');
      }
    }
    
    // Agregar fila
    sheet.appendRow([
      nuevoId,
      productoData.nombre,
      productoData.categoria || 'General',
      productoData.talla,
      productoData.color,
      productoData.precioCompra || 0,
      productoData.precioVenta || 0,
      productoData.stock || 0,
      productoData.stockMin || 10
    ]);
    
    // Actualizar inventario
    actualizarInventario();
    
    return {
      success: true,
      id: nuevoId,
      message: '✅ Producto agregado exitosamente'
    };
    
  } catch (error) {
    return { error: error.toString() };
  }
}

// ============ FUNCIONES PARA AJUSTAR STOCK ============

function actualizarStock(productoId, nuevoStock, motivo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('👗 CATALOGO');
    
    if (!sheet) return { error: 'Hoja de catálogo no encontrada' };
    
    const data = sheet.getDataRange().getValues();
    let productoNombre = '';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productoId) {
        productoNombre = data[i][1];
        sheet.getRange(i + 1, 8).setValue(nuevoStock);
        
        // Actualizar inventario
        actualizarInventario();
        
        return {
          success: true,
          producto: productoNombre,
          nuevoStock: nuevoStock,
          message: `✅ Stock actualizado: ${productoNombre} = ${nuevoStock} unidades`
        };
      }
    }
    
    return { error: 'Producto no encontrado' };
  } catch (error) {
    return { error: error.toString() };
  }
}
