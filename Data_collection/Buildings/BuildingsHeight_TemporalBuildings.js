var openBuildingsTemporal = ee.ImageCollection(
  'GOOGLE/Research/open-buildings-temporal/v1');

// Choose a year between 2013 and 2023
var year = 2023;

var startDate = ee.Date.fromYMD(year, 1, 1);
var endDate = startDate.advance(1, 'year');

var filtered = openBuildingsTemporal
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.bounds(geometry));

// The data is divided into smaller tiles
print('Image Tiles', filtered);

// Mosaic the tiles

// We extract the projection information an original tile
// which we will assign to the mosaic
var projection = filtered.first().projection();

// This is important as we want our projection to have the same units 
// as building heights (which is meters)
var buildingsMosaic = filtered.mosaic()
  .setDefaultProjection(projection);
print('Open Buildings Temporal Image Mosaic',
  buildingsMosaic);

// ****************************************************
// Extracting Building Heights Raster and DSM
// ****************************************************

// Select the building_height band
var buildingHeights = buildingsMosaic
  .select('building_height');

// Visualize the heights
var heightPalette = ['1d4877', '1b8a5a', 'fbb021', 'f68838', 'ee3e32'];
var heightVisParams = {min:0, max:50, palette: heightPalette};
Map.centerObject(geometry);
Map.addLayer(buildingHeights.clip(geometry),
  heightVisParams, 'Building Heights Raster');

// We can create a DSM by adding high-resolution canopy
// hieght and a terrain model

// Add Canopy Height
// 1m Global Canopy Height Maps by WRI/Meta
// https://gee-community-catalog.org/projects/meta_trees/
var canopyHeight = ee.ImageCollection(
  'projects/meta-forest-monitoring-okw37/assets/CanopyHeight')
  .mosaic()
  .rename('canopy_height');
var treeMask = canopyHeight.updateMask(canopyHeight.gte(1));
var treeHeight = treeMask.unmask(0);

// Add tree height to the building height
var buildingsAndTrees = buildingHeights.add(treeHeight);

// Add Terrain Height
// Use FABDEM for the GEE Community Catalog
// https://gee-community-catalog.org/projects/fabdem
var fabdem = ee.ImageCollection(
  'projects/sat-io/open-datasets/FABDEM');

var fabdemFiltered = fabdem
  .filter(ee.Filter.bounds(geometry));
// We extract the projection information an original tile
// which we will assign to the mosaic
var fabdemProjection = fabdemFiltered.first().projection();

var fabdemMosaic = fabdem.mosaic()
  .setDefaultProjection(fabdemProjection);
var dem = fabdemMosaic.select('b1');

// Optionally resample the DEM for smoother
// output at higher resoluton
// 'bicubic' will be more aggresive smoothing
// Uncomment the line below to apply resampling

// dem = dem.resample('bilinear');

// Add terrain height to building heights
var dsm = buildingsAndTrees.add(dem);


// Export the results as GeoTIFF

// While the images are provided at a 0.5m resolution
// The effective spatial resolution is 4m.
var buildingResolution = 4;

Export.image.toDrive({
  image: buildingHeights.clip(geometry),
  description: 'Building_Height_Raster_' + year,
  folder: 'earthengine',
  fileNamePrefix: 'building_height_raster_' + year,
  region: geometry,
  scale: buildingResolution
});

// Export the DSM
Export.image.toDrive({
  image: dsm.clip(geometry),
  description: 'DSM_' + year,
  folder: 'earthengine',
  fileNamePrefix: 'dsm_' + year,
  region: geometry,
  scale: buildingResolution
});

// ****************************************************
// Extracting Building Footprints with Heights
// ****************************************************

// Combine Open Buildings V3 polygons with 
// Building Heights

// Load the building footprint polygons
var openBuildingsPolygons = ee.FeatureCollection(
  ee.FeatureCollection("projects/sat-io/open-datasets/VIDA_COMBINED/NGA"));

// Select all buildings in the chosen region
var allBuildings  = openBuildingsPolygons
  .filter(ee.Filter.bounds(geometry));

// This dataset does not have any temporal information
// We need to filter out buildings not present in the chosen year
// by extracting temporal information from the
// Open Buildings Temporal dataset
var temporalBands = buildingsMosaic.select([
  'building_presence', 'building_height']);

// Extract the presence score and building height for each polygon
var allBuildingsData = temporalBands.reduceRegions({
  collection: allBuildings,
  reducer: ee.Reducer.mean(),
  scale: buildingResolution,
  tileScale: 16,
});
// Select buildings with high building_presence score
// This score may have to be adjusted for different regions
var buildingsFiltered = allBuildingsData
  .filter(ee.Filter.gt('building_presence', 0.5));

// The results have geometries in EPSG:4326
// We map() a function to reproject the layer
var buildingsReprojected = buildingsFiltered
  .map(function(f) {
    return f.transform({
      proj: projection, 
      maxError: 0.1});
});

// We now have building footprint polygons at the chosen year
// along with building height information

// We have many properties from the original polygon data and
// also those extracted from temporal layers
// Some properties such as longitude_latitude are stored as 
// point objects which cannot be exported to external vector formats
// We choose the numeric properties we want to export
var selectedProperties = ['area_in_meters', 'building_height'];
// Rename the properties to be compatible to shapefile format
var renamedProperties = ['area', 'height'];
var buildingsExport = buildingsReprojected.select(
  selectedProperties, renamedProperties);
// Export the building polygons with height
Export.table.toDrive({
  collection: buildingsExport,
  description: 'Building_Polygons_with_Height_' + year,
  folder: 'earthengine',
  fileNamePrefix: 'building_polygons_with_height_' + year,
  fileFormat: 'SHP',
  selectors: renamedProperties
});

/*
Copyright (c) 2025 Ujaval Gandhi.

This code is open-source and available under the terms
of the MIT license. For a copy, see
https://opensource.org/licenses/MIT

Please credit the original author if you use the code.
*/