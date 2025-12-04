//### DEM FORM COPERNICUS GLO30 - ELEVATION DATA DOWNLOAD SCRIPT
// This script downloads elevation data from the Copernicus GLO-30 DEM dataset.
// It includes visualization and export options for raw elevation data. 
// SOURCE: https://gee-community-catalog.org/projects/glo30/#citation

// 1. DEFINITIONS 
var glo30 = ee.ImageCollection("COPERNICUS/DEM/GLO30");

// define AOI
var geometry = geometry

// 2. YOUR PROCESSING CODE

var elev = glo30.mosaic().setDefaultProjection('EPSG:3857',null,30);

// Create an "ocean" variable to be used for cartographic purposes
var ocean = elev.lte(0);

// Create a custom elevation palette from hex strings.
var elevationPalette = ['006600', '002200', 'fff700', 'ab7634', 'c4d0ff', 'ffffff'];

// Use these visualization parameters, customized by location.
var visParams = {min: 1, max: 3000, palette: elevationPalette};

// 3. CORRECTED VISUALIZATION
// **Explicitly select the single band 'elevation' before calling Map.addLayer.**
Map.addLayer(elev.select('DEM').clip(geometry), visParams, 'Custom Elevation');

// Center the map on the geometry.
Map.centerObject(geometry, 6);


// 3. EXPORT CODE

// OPTION A: Export Raw Data (Best for analysis in QGIS/ArcGIS)
// This exports a single-band GeoTIFF with actual height values.
Export.image.toDrive({
  image: elev,                  
  description: 'GLO30_Elevation_Raw',
  folder: 'GEE_Exports',        
  scale: 30,                    
  region: geometry, 
  crs: 'EPSG:3857',            
  maxPixels: 1e13,             
  fileFormat: 'GeoTIFF'
});


//### FABDEM - ELEVATION DATA DOWNLOAD SCRIPT
// This script downloads elevation data from the FABDEM dataset.
// FABDEM (Forest And Buildings removed Copernicus DEM) removes building and tree height biases from the Copernicus GLO 30 Digital Elevation Model (DEM) (Airbus, 2020). 
// SOURCE: https://gee-community-catalog.org/projects/fabdem/

// 1. DEFINITIONS (Needed to make the code run)
// Use the custom FABDEM asset path provided by the user.
var fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM").filterBounds(geometry);


print(fabdem)

// 2. YOUR PROCESSING CODE
// The FABDEM collection's primary band is 'b0'. We select it explicitly.
// Setting default Projection (e.g., EPSG:3857, zoom 30m)
var elev = fabdem.select('b1').mosaic().setDefaultProjection('EPSG:3857', null, 30);

// Add the elevation to the map for initial inspection.
Map.addLayer(elev, {min: 0, max: 6000}, 'FABDEM Elevation', false);

// Use the terrain algorithms to compute a hillshade with 8-bit values.
var shade = ee.Terrain.hillshade(elev);
Map.addLayer(shade, {}, 'Hillshade', false);

// Create an "ocean" variable to be used for cartographic purposes
// Areas with elevation <= 0 are considered ocean/water.
var ocean = elev.lte(0);
Map.addLayer(ocean.mask(ocean), {palette:'000022'}, 'Ocean Mask', false);

// Create a custom elevation palette from hex strings.
var elevationPalette = ['006600', '002200', 'fff700', 'ab7634', 'c4d0ff', 'ffffff'];

// Use these visualization parameters, customized by location.
var visParams = {min: 1, max: 3000, palette: elevationPalette};

// 3. FINAL CARTOGRAPHIC VISUALIZATION
// Create a mosaic of the ocean and the elevation data
var visualized = ee.ImageCollection([
  // Mask the elevation to get only land (where ocean is NOT true) and visualize it.
  elev.mask(ocean.not()).visualize(visParams), 
  // Use the ocean mask directly to display ocean.
  ocean.mask(ocean).visualize({palette:'000022'})
]).mosaic();

// Add the final, clipped visualized image to the map.
// This uses your existing 'geometry' variable for clipping.
Map.addLayer(visualized.clip(geometry), {}, 'Custom Elevation Palette');

// Center the map on your provided geometry.
Map.centerObject(geometry, 6);

Export .image.toDrive({
  image: elev,                  
  description: 'FABDEM_Elevation_Raw',
    folder: 'GEE_Exports',
    scale: 30,
    region: geometry,
    crs: 'EPSG:3857',
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
});