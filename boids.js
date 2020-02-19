'use strict';

class Boid {
  constructor (id, position, velocity) {
    this.id = id;
    this.position = position;
    this.velocity = velocity;
    this.force = new BABYLON.Vector3(0, 0, 0);
  }

  get orientation () {
    return this.velocity.normalize();
  }
}

class BoidsManager {
  constructor (total, center, initialRadius = 1.0, boundRadiusScale = 100.0, initialVelocity = null) {
    // control factors
    this.cohesion = 0.3;
    this.separation = 0.4;
    this.alignment = 1.0;
    this.separationMinDistance = 3.0;
    this.maxSpeed = 1.0; // in units per second

    // set bounds
    this.boundsMin = new BABYLON.Vector3(
      center.x - boundRadiusScale, center.y - boundRadiusScale, center.z - boundRadiusScale
    );
    this.boundsMax = new BABYLON.Vector3(
      center.x + boundRadiusScale, center.y + boundRadiusScale, center.z + boundRadiusScale
    );

    this.otherForces = []; // other force callbacks
    this.boids = []; // list of boids

    // debug
    this.debug = {
      show: false,
      influences: [],
      arrows: []
    };

    if (!initialVelocity) {
      initialVelocity = new BABYLON.Vector3(0.3, 0.1, 0.3);
    }
    const initialSpeed = initialVelocity.length();

    // internal data, cached per frame
    this.center = center.clone();
    this.avgVel = new BABYLON.Vector3(0.0, 0.0, 0.0);

    for (let i = 0; i < total; i++) {
      const position = this.center.add(
        new BABYLON.Vector3(
          (Math.random() - 0.5) * initialRadius,
          (Math.random() - 0.5) * initialRadius,
          (Math.random() - 0.5) * initialRadius
        )
      );
      const velocity = new BABYLON.Vector3(
        initialVelocity.x + (Math.random() - 0.5) / 10.0 * initialSpeed,
        initialVelocity.y + (Math.random() - 0.5) / 10.0 * initialSpeed,
        initialVelocity.z + (Math.random() - 0.5) / 10.0 * initialSpeed
      );
      const boid = new Boid(i, position, velocity);
      this.boids.push(boid);
    }
  }

  /**
     * Updates the boids.
     *
     * @param {Number} deltaTime The time since last frame in seconds
     */
  update (deltaTime) {
    this._updateCenter();
    const maxSpeedSquared = this.maxSpeed * this.maxSpeed;
    this.boids.forEach((boid) => {
      const f1 = this._forceCentreMass(boid);
      const f2 = this._forceSeparation(boid);
      const f3 = this._forceMatchVelocity(boid);
      const f4 = this._forceBoundaries(boid);
      const f = f1.add(f2).add(f3).add(f4);

      this.otherForces.forEach(
        (forceCallback) => {
          f.add(forceCallback(this, boid));
        }
      );

      // force = mass * acceleration
      boid.force.copyFrom(f);
      boid.velocity.addInPlace(f.scale(deltaTime));

      // clamp velocity
      if (boid.velocity.lengthSquared() > maxSpeedSquared) {
        boid.velocity = boid.velocity.normalize().scale(this.maxSpeed);
      }

      boid.position.addInPlace(boid.velocity.scale(deltaTime));
    });
    this._updateDebug();
  }

  /**
     * Recalculates the center of mass amd average velocity
     */
  _updateCenter () {
    if (!this.boids.length) {
      return;
    }
    const center = new BABYLON.Vector3(0, 0, 0);
    const avgVel = new BABYLON.Vector3(0, 0, 0);

    this.boids.forEach((boid) => {
      center.addInPlace(boid.position);
      avgVel.addInPlace(boid.velocity);
    });

    center.scaleInPlace(1.0 / this.boids.length);
    avgVel.scaleInPlace(1.0 / this.boids.length);

    this.center = center;
    this.avgVel = avgVel;
  }

  /**
     * Boids try to fly towards the centre of mass of neighbouring boids.
     * @param {Bird} boid
     */
  _forceCentreMass (boid) {
    // TODO: we could remove the boid position from the average
    return this.center.subtract(boid.position).scale(this.cohesion);
  }

  /**
     * Boids try to keep a small distance away from other objects (including other boids).
     * @param {Bird} boid
     */
  _forceSeparation (boid) {
    const f = new BABYLON.Vector3(0, 0, 0);

    // TODO this is n^2, improve
    this.boids.forEach((other) => {
      if (boid.id === other.id) {
        return;
      }
      const v = boid.position.subtract(other.position);
      const d2 = v.length();
      if (d2 < this.separationMinDistance) {
        f.addInPlace(v.scale(this.separationMinDistance - d2));
      }
    });
    return f.scale(this.separation);
  }

  /**
     * Boids try to match velocity with near boids.
     * @param {Bird} boid
     */
  _forceMatchVelocity (boid) {
    // TODO: we could remove the boid position from the average
    return this.avgVel.subtract(boid.velocity).scale(this.alignment);
  }

  /**
     * Boids want to get away from boundaries
     * @param {Bird} boid
     */
  _forceBoundaries (boid) {
    const f = new BABYLON.Vector3(0, 0, 0);
    const amount = 0.2;
    // clamp to area
    if (boid.position.x < this.boundsMin.x * 0.9) {
      f.x = amount;
    } else if (boid.position.x > this.boundsMax.x * 0.9) {
      f.x = -amount;
    }
    if (boid.position.y < this.boundsMin.y * 0.9) {
      f.y = amount;
    } else if (boid.position.y > this.boundsMax.y * 0.9) {
      f.y = -amount;
    }
    if (boid.position.z < this.boundsMin.z * 0.9) {
      f.z = amount;
    } else if (boid.position.z > this.boundsMax.z * 0.9) {
      f.z = -amount;
    }
    return f;
  }

  /**
     * Adds a new force to the callback list. The callback receives a {Bird} as argument.
     *
     * @param {callback} boid
     */
  addForce (c) {
    this.otherForces.push(c);
  }

  /**
     * Turns on debug menu and helpers.
     * @param {BABYLON.Scene} scene
     */
  showDebug (scene) {
    if (this.debug.show) {
      return;
    }

    // build a material
    const centerMaterial = new BABYLON.StandardMaterial('debug_center', scene);
    centerMaterial.diffuseColor = BABYLON.Color3.FromHexString('#FF0000');
    this.debug.center = BABYLON.MeshBuilder.CreateSphere(
      'center',
      {
        diameter: 0.1,
        segments: 8
      }
    );

    // build bbox
    const bboxMaterial = new BABYLON.StandardMaterial('debug_bbox', scene);
    bboxMaterial.diffuseColor = BABYLON.Color3.FromHexString('#00FF00');
    bboxMaterial.wireframe = true;
    this.debug.center.material = centerMaterial;

    this.debug.bbox = BABYLON.Mesh.CreateBox('boids_bbox', 1.0, scene);
    this.debug.bbox.scaling.x = Math.abs(this.boundsMax.x - this.boundsMin.x);
    this.debug.bbox.scaling.y = Math.abs(this.boundsMax.y - this.boundsMin.y);
    this.debug.bbox.scaling.z = Math.abs(this.boundsMax.z - this.boundsMin.z);
    this.debug.bbox.position.x = Math.abs(this.boundsMax.x - this.boundsMin.x) / 2;
    this.debug.bbox.position.y = Math.abs(this.boundsMax.y - this.boundsMin.y) / 2;
    this.debug.bbox.position.z = Math.abs(this.boundsMax.z - this.boundsMin.z) / 2;
    this.debug.bbox.material = bboxMaterial;

    const wireframeMaterial = new BABYLON.StandardMaterial('debug_wireframe', scene);
    wireframeMaterial.diffuseColor = BABYLON.Color3.FromHexString('#FFFFFF');
    wireframeMaterial.wireframe = true;
    for (const boid of this.boids) {
      boid.debug = {};
      boid.debug.force = BABYLON.MeshBuilder.CreateTube(
        `boid_arrow_${boid.uniqueId}`,
        {
          path: [boid.position.add(boid.velocity), boid.position.clone()],
          radius: 0.01,
          updatable: true
        }, scene
      );
      boid.debug.influence = BABYLON.MeshBuilder.CreateSphere(
        `boid_influence_${boid.uniqueId}`,
        {
          diameter: 1.0,
          segments: 8
        }
      );
      boid.debug.influence.scaling.setAll(this.separationMinDistance);
      boid.debug.influence.material = wireframeMaterial;
    }
    this.debug.show = true;
  }

  /**
     * Hides debug helpers.
     *
     * @param {BABYLON.scene} scene
     */
  hideDebug (scene) {
    this.debug.show = false;
    this.debug.center = undefined;
    for (const boid of this.boids) {
      if (boid.debug) {
        boid.debug.force.dispose();
        boid.debug.influence.dispose();
        boid.debug = {};
      }
    }
  }

  /**
     * Updates debug data internally.
     */
  _updateDebug () {
    if (!this.debug.show) {
      return;
    }
    this.debug.center.position.copyFrom(this.center);
    for (const boid of this.boids) {
      const path = [boid.position.add(boid.force.scale(20.0)), boid.position.clone()];
      boid.debug.force = BABYLON.MeshBuilder.CreateTube(boid.debug.force.name, { path, radius: 0.01, instance: boid.debug.force });
      boid.debug.influence.position.copyFrom(boid.position);
    }
  }

  /**
     * Setup GUI.
     * @param {BABYLON.Scene} scene
     */
  gui (scene) {
    const { GUI } = BABYLON;
    // GUI
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', undefined, undefined, scene);

    const panel = new GUI.StackPanel();
    panel.width = '220px';
    panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(panel);

    const makeSlider = (name, maximum = 4.0, callback = () => { }) => {
      const header = new GUI.TextBlock();
      header.text = `${name} ${this[name]}`;
      header.height = '30px';
      header.color = 'white';
      panel.addControl(header);
      const slider = new GUI.Slider();
      slider.minimum = 0;
      slider.maximum = maximum;
      slider.value = this[name];
      slider.height = '20px';
      slider.width = '200px';
      const f = (function (boids, header, name) {
        return (value) => {
          boids[name] = value;
          header.text = `${name} ${value}`;
          callback.apply(boids);
        };
      }(this, header, name));
      slider.onValueChangedObservable.add(f);
      panel.addControl(slider);
    };
    makeSlider('cohesion', 1.5);
    makeSlider('separation');
    makeSlider('alignment');
    makeSlider('separationMinDistance', 50.0, (boids) => {
      if (this.debug.center) {
        this.boids.forEach((boid) => {
          boid.debug.influence.scaling.setAll(this.separationMinDistance);
        });
      }
    });

    const header = new GUI.TextBlock();
    header.text = 'show debug helpers';
    header.height = '30px';
    header.color = 'white';
    panel.addControl(header);
    const checkbox = new GUI.Checkbox();
    checkbox.width = '20px';
    checkbox.height = '20px';
    checkbox.isChecked = this.debug.show;
    checkbox.color = 'green';
    checkbox.onIsCheckedChangedObservable.add((value) => {
      if (value) {
        this.showDebug(scene);
      } else {
        this.hideDebug(scene);
      }
    });
    panel.addControl(checkbox);
  }
}

export default BoidsManager;
