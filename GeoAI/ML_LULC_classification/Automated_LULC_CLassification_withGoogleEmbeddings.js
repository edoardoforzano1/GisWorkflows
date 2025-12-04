// ********************************************************************************************************
//GENERAL SETTINGS
// ********************************************************************************************************
Map.centerObject(geometry,11);
var scale= 30

// Pick a year for classification
var year = 2024;
var yearTemporalBuildings = 2023
var startDate = ee.Date.fromYMD(year, 1, 1);
var endDate = startDate.advance(1, 'year');
var nTrainingSamples = 200


// ********************************************************************************************************
// OPTION 1: AUTOMATIC TRAINING POINTS EXTRACTION FROM DYNAMIC WORLD PROBABILITY BAND
// ********************************************************************************************************

//Dynamic World//
var probabilityBands = [
    'water', 'trees', 'grass', 'flooded_vegetation', 'crops',
    'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'
    ];
    
var dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')

var dwfiltered = dw
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.bounds(geometry))
  .select(probabilityBands)

var dwFinal = dwfiltered.mean();

function sampleDWClassDWonly(className, threshold, classCode, colorHex) {
  var prob = dwFinal.select(className).clip(geometry);
  var mask = prob.gt(threshold).rename('mask');
  var masked = mask.updateMask(mask);  // Only mask where prob > threshold

  var input = prob.addBands(masked.rename('classmask'));

  var samples = input.stratifiedSample({
    numPoints: nTrainingSamples,
    classBand: 'classmask',
    region: geometry,
    scale: scale,
    tileScale: 16,
    seed: classCode * 10,
    dropNulls: true,
    geometries: true
  });

  // Set class value (only for class pixels, exclude 0)
  var labeled = samples.map(function(f) {
    var isClass = ee.Number(f.get('classmask')).eq(1);
    return f.set('class', isClass.multiply(classCode));
  });

  var finalSamples = labeled.filter(ee.Filter.gt('class', 0));

  // Visualize
  Map.addLayer(finalSamples, {color: colorHex}, className + ' Samples',false);
  //print(className + ' samples:', finalSamples.size());

  return finalSamples;
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Sample DW classes
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var builtSamples = sampleDWClassDWonly('built', 0.60, 1, 'E53A27');
var treeSamples   = sampleDWClassDWonly('trees', 0.4, 5, '719462');       
var grassSamples  = sampleDWClassDWonly('grass', 0.4, 6, 'EBEACC');        
var wetlandsSamples  = sampleDWClassDWonly('flooded_vegetation', 0.4, 7, '6699A6'); 
var shrubSamples  = sampleDWClassDWonly('shrub_and_scrub', 0.4, 8, 'D3BA81');   
var waterSamples  = sampleDWClassDWonly('water', 0.4, 2, 'B9DAEC');        
var bareSamples   = sampleDWClassDWonly('bare', 0.4, 3, 'E4ECF4');        
var cropSamples   = sampleDWClassDWonly('crops', 0.30, 4, 'FBF3A6');     


//BUILTUP from Google Open Buildings Temporal 
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// BUILT-UP CLASS (from open-buildings-temporal)
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// 1. Load building presence band for year of interest
var col = ee.ImageCollection('GOOGLE/Research/open-buildings-temporal/v1')
  .filterBounds(geometry)
  .filter(ee.Filter.calendarRange(yearTemporalBuildings, yearTemporalBuildings, 'year'))
  .select('building_presence');

// 2. Create building presence composite image
var buildingComposite = col.median().clip(geometry);

// 3. Threshold: building presence > 0.4
var builtMask = buildingComposite.gt(0.4).rename('builtmask');
var builtMasked = builtMask.updateMask(builtMask);

// 4. Create input image (with class band)
var inputBuilt = buildingComposite.addBands(builtMasked.rename('classmask'));

// 5. Stratified sample: only samples from built pixels
var rawBuiltSamples = inputBuilt.stratifiedSample({
  numPoints: nTrainingSamples,
  classBand: 'classmask',
  region: geometry,
  scale: scale,
  seed: 100,
  tileScale: 16,
  dropNulls: true,
  geometries: true
});

// 6. Set class = 7 (for built-up)
var googleBuiltSamples = rawBuiltSamples
  .filter(ee.Filter.eq('classmask', 1))
  .map(function(f) {
    return f.set('class', 1);
  });

// 7. Visualize and print
Map.addLayer(googleBuiltSamples, {color: 'red'}, 'Built-up Samples',false);


// ********************************************************************************************************
// Merge all samples
// ********************************************************************************************************
var allSamples = treeSamples.merge(grassSamples).merge(wetlandsSamples).merge(shrubSamples).merge(waterSamples).merge(bareSamples).merge(cropSamples).merge(googleBuiltSamples);

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Summary
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

//print('Total training samples:', allSamples.size());
//print('Class distribution:', allSamples.aggregate_histogram('class'));


// ********************************************************************************************************
// OPTION 2:  INPUT MANUALLY THE TRAINING SAMPLES, USING SENTINEL2 AS REFERENCE
// ********************************************************************************************************

// Create a Sentinel-2 Compsite for the selected year
// for selecting training samples
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var filteredS2 = s2
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.bounds(geometry));

// Use the Cloud Score+ collection for cloud masking
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var csPlusBands = csPlus.first().bandNames();
var filteredS2WithCs = filteredS2.linkCollection(csPlus, csPlusBands);

function maskLowQA(image) {
  var qaBand = 'cs';
  var clearThreshold = 0.6;
  var mask = image.select(qaBand).gte(clearThreshold);
  return image.updateMask(mask);
}

var filteredS2Masked = filteredS2WithCs
  .map(maskLowQA)
  .select('B.*');  
  
// Create a median composite of cloud-masked images
var composite = filteredS2Masked.median();

// Display the input composite in false color
// that helps distinguish between
// water, vegetation and built surfaces
var swirVis = {min: 300, max: 4000, bands: ['B8', 'B4', 'B3']};


Map.addLayer(composite.clip(geometry), swirVis, 'S2 Composite (False Color)',false);


// ********************************************************************************************************
//TRAINING AND VALIDATION//
//To chose between manually placed labels vs automatically extracted labels
// ********************************************************************************************************


//OPTION 1

var gcps = allSamples;

//OPTION 2
// Merge the collected training samples
//var gcps = mangrove.merge(water).merge(built).merge(crop).merge(forest).merge(shrubland).merge(grassland).merge(bare);


// Add a random column and split the GCPs into training and validation set
var gcps = gcps.randomColumn();

// This being a simpler classification, we take 60% points
// for validation. Normal recommended ratio is
// 70% training, 30% validation
var trainingGcp = gcps.filter(ee.Filter.lt('random', 0.7));
var validationGcp = gcps.filter(ee.Filter.gte('random', 0.7));
//Map.addLayer(validationGcp);


// Sample Embedding Vectors
var embeddings = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL'); 

var embeddingsFiltered = embeddings
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.bounds(geometry));

var embeddingsImage = embeddingsFiltered.mosaic();

// Visualize three axes of the embedding space as an RGB.
var visParams = {min: -0.1, max: 0.1, bands: ['A01', 'A16', 'A09']};

Map.addLayer(embeddingsImage, visParams, 'embeddings' + year, false);


// ****************************************************
//STACK VARIABLES TOGETHER
// ****************************************************
var compositeClassification = embeddingsImage;


// Overlay the samples on the image to get training data.
var training = compositeClassification.sampleRegions({
  collection: trainingGcp, 
  properties: ['class'], 
  scale: scale
});




// ****************************************************
// Train a Classifier
// ****************************************************
// Train a classifier.
var classifier = ee.Classifier.smileKNN().train({
  features: training,  
  classProperty: 'class', 
  inputProperties: compositeClassification.bandNames()
});

// Classify the Satellite Embedding Mosaic
// ****************************************************

var classified = compositeClassification.classify(classifier);


// Use classification map to assess accuracy using the validation fraction
// of the overall training set created above.
var test = classified.sampleRegions({
  collection: validationGcp,
  properties: ['class'],
  scale: scale,
  tileScale: 16
});

var testConfusionMatrix = test.errorMatrix('class', 'classification');

print('Confusion Matrix', testConfusionMatrix);

print('Test Accuracy', testConfusionMatrix.accuracy()); 


// ****************************************************
// Visualize the classification
// ****************************************************

var palette = ['E53A27', 'B9DAEC', 'E4ECF4','FBF3A6','719462', 'EBEACC','6699A6','D3BA81'];

Map.addLayer(
  classified.clip(geometry),
  {min: 1, max: 8, palette: palette}, 
  'Classified Satellite Embeddings Image');


// If the export has more than 1e8 pixels, set "maxPixels" higher.
Export.image.toDrive({
  image: classified,
  description: 'Classified'+year,
  folder: 'ee_demos',
  region: geometry,
  scale: 30,
  
  maxPixels: 1e13
});



// ****************************************************
// Add Legend for Final Classification
// ****************************************************

// Define class names and colors
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

// Title
var legendTitle = ui.Label({
  value: 'Legend - Final Classification',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});
legend.add(legendTitle);

// Define palette and class labels
var paletteList = [
  {color: 'E53A27', name: 'Built-up'},
  {color: 'B9DAEC', name: 'Water'},
  {color: 'E4ECF4', name: 'Bare'},
  {color: 'FBF3A6', name: 'Crops'},
  {color: '719462', name: 'Trees'},
  {color: 'EBEACC', name: 'Grass'},
  {color: '6699A6', name: 'Wetlands'},
  {color: 'D3BA81', name: 'Shrubland'}
];

// Function to make legend row
var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

// Add each row to the legend
paletteList.forEach(function(item) {
  legend.add(makeRow(item.color, item.name));
});

// Add the legend to the map
Map.add(legend);
