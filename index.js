var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});


function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class Fighter {
  constructor(name) {
    this.name = name;
    this.action = "None";
    // Generate stats
    this.generateStats();
  }

  generateStats() {
    // Randomize values
    this.hp = getRandomIntInclusive(10, 50);
    this.original_hp = this.hp;
    this.attack = getRandomIntInclusive(10, 15);
    this.defense = getRandomIntInclusive(5, 10);
    this.speed = getRandomIntInclusive(5, 10);
  }

  attackTarget(target) {
    // Get the chance of hitting it
    var target_evasion = (target.defense + target.speed) * (target.action == "Defense" ? 1.5 : 1);
    var luck = getRandomIntInclusive(5, 20)/10;
    var hit_chance = Math.floor(this.attack * luck);

    var did_it_hit = hit_chance > target_evasion;
    // If we did, attack the target
    if(did_it_hit){
      target.takeDamage(this.attack);
      return this.attack;
    }
    else{
      return 0;
    }
  }

  takeDamage(damage) {
    this.hp -= damage;
  }

  getName() {
    return this.name;
  }

  isDead(){
    return !(this.hp > 0);
  }
  revive(){
    this.hp = this.original_hp;
  }
  reroll(){
    this.generateStats();
  }
  toString(){
    return "Fighter: " + this.name + "[" + this.hp+ "]";
  }
}

class Player{
  constructor(socket){
    this.socket = socket;
    this.state = "set_name";
    this.ready = false;
  }

  setName(name){
    this.name = name;
  }

  getName(){
    return this.name;
  }
  getState(){
    return this.state;
  }
  setState(state){
    this.state = state;
  }
  setFighter(fighter){
    this.fighter = fighter;
  }
  getFighter(){
    return this.fighter;
  }
  isNameSet(){
    return this.name != 'undefined';
  }
}

var possible_actions = [
  "{fighter} uses a chair to hit {target}!",
  "{fighter} tries to stab {target} with a fork!",
  "{fighter} called {target}'s mother to insult her!",
  "{fighter} killed {target}'s dog to inflict emotional damage!",
  "{fighter} climbed the cage's wall and jumped, aiming for {target}!",
  "{fighter} cooked a cake for {target}, then DESTROYED it in front of him!",
  "{fighter} told {target} he wasn't angry, just dissapointed!",
  "{fighter} tripped {target}!",
  "{fighter} smacked {target}!",
  "{fighter} slapped {target}'s ass!"
];

class Battle {
  constructor(name){
    this.name = name; // Name of the battle
    this.fighters = [];
    this.started = false;
    this.battle_log = [];
  }

  addFighter(fighter){
    this.fighters.push(fighter);
  }
  currentState(){
    return this.state;  
  }
  start(){
    this.reset();
    this.started = true;
  }
  end(){
    this.started = false;
  }
  reset(){
    this.battle_log = [];
    this.reviveFighters();
  }
  tick(){
    // For each player
    var new_actions = [];
    for(var i=0;i<this.fighters.length;i++){
      var fighter = this.fighters[i];
      // What action did it take?
      var target_index, target, result, damage;
      if(fighter.action == "Attack" && !fighter.isDead()){
        // Get a random target (not self)
        target_index = getRandomIntInclusive(0, this.fighters.length-1);
        while(target_index == i){
          target_index = getRandomIntInclusive(0, this.fighters.length-1);
        }
        target = this.fighters[target_index];
        damage = fighter.attackTarget(target);
        result = this.doAttack(fighter, target, damage);
        new_actions.push(result);
        this.battle_log.push(result);
        if(target.isDead()){
          new_actions.push(target.getName() + " dies!");
          this.battle_log.push(target.getName() + " dies!");
        }
      }
    }
    // Get the winner, add it to the log
    var alive_fighters = this.getAliveFighters();
    var winner_text = "";
    if(alive_fighters.length == 0){
      winner_text = "No winners! Everyone is DEAD!";
      this.battle_log.push(winner_text);
      this.end();
    }
    else if(alive_fighters.length == 1){
      winner_text = alive_fighters[0].getName() + " is the winner!";
      this.battle_log.push(winner_text);
      this.end();
    }
    return new_actions;
  }

  isBattleOver(){
    // Check all fighters, if there's only one (or 0) with more than 0 hp, we're still on
    var alive_fighters_count = this.getAliveFighters().length;
    if(alive_fighters_count == 0 || alive_fighters_count == 1){
      return true;
    }
    else {
      return false;
    }
  }
  getAliveFighters(){
    var alive_fighters = [];
    this.fighters.forEach(function(fighter){
      if(!fighter.isDead()){
        alive_fighters.push(fighter);
      }
    });
    return alive_fighters;
  }
  getBattleLog(){
    return this.battle_log;
  }
  reviveFighters(){
    this.fighters.forEach(function(fighter){
      if(fighter.isDead()){
        fighter.revive();
      }
    });
  }
  doAttack(fighter, target, damage){
    var fighter_name, target_name, action, action_index, result;
    fighter_name = fighter.getName();
    target_name = (fighter == target) ? "itself" : target.getName();
    // Get a random action
    // And an action
    action_index = getRandomIntInclusive(0, possible_actions.length-1);
    action = possible_actions[action_index];
    // Now replace the values with the name
    result = action.replace("{fighter}", fighter_name).replace("{target}", target_name);
    // Did it hit?
    if(damage != 0){
      result += " And it HITS for " + damage + " damage!";
    }
    else{
      result += " But it misses!";
    }
    return result;
  }
}



function allReady(){
  for(var i=0;i<players.length;i++){
    if(players[i].ready === false)
      return false;
  }
  return true;
}

function resetReady(){
  players.forEach(function(player){
      player.ready = false;
    });
}

function getDeadAndAlive(){
  var result = {};
  result.alive = [];
  result.dead = [];
  players.forEach(function(player){
    if(player.getFighter().isDead()){
      result.dead.push(player);
    }
    else{
      result.alive.push(player);
    }
  });
  return result;
}

var userCounter = 0;
var players = [];

// Create battle
var battle = new Battle("Killing Tournament");

io.on('connection', function(socket){

  // Create player
  var player = new Player(socket);
  players.push(player);
  socket.emit("get_name", player.getState());

  socket.on("set_name", function(msg){
    // Did we set it before?
    if(!player.getName()){
      player.setName(msg);
      player.setState("set_fighter_name");
    }
    // Now get the character name
    socket.emit("get_fighter_name", player.getState());
  });

  socket.on("set_fighter_name", function(msg){
    // Did we set it before?
    var fighter = new Fighter(msg);
    player.setFighter(fighter);
    battle.addFighter(fighter);
    player.setState("ready");
    player.ready = true;
    // Is everyone ready?
    socket.emit("waiting_ready", player.getFighter());
    if(players.length > 1 && allReady()){
      battle.start();
      resetReady();
      io.emit("start", []);
      io.emit("play_turn", []);  
    }
  });

  socket.on("play_turn", function(msg){
    // Get action
    player.ready = true;
    socket.emit("waiting_turn_ready", []);
    if(msg.toUpperCase() == "ATTACK" || msg.toUpperCase() == "DEFEND"){
      player.getFighter().action = msg;
    }
    else{
      player.getFighter().action = "None";
    }
    // Everybody sent their action?
    if(allReady()){
      // One tick of the battle
      var result = battle.tick();
      // Emit result
      resetReady();
      // Send actions
      if(battle.isBattleOver()){
        io.emit("game_result", battle.getBattleLog());
      }
      else{
        io.emit("turn_result", result);
        var deadAndAlive = getDeadAndAlive();
        // Let the ones who died know
        deadAndAlive.dead.forEach(function(deadPlayer){
          deadPlayer.socket.emit("died", []);
        });
        // For the rest, ask for action
        deadAndAlive.alive.forEach(function(alivePlayer){
          alivePlayer.socket.emit("play_turn", alivePlayer.getFighter());  
        });
      }    
    }
    else{
      // Gonna have to wait
    }

  });

  socket.on('disconnect', function(){
    // Remove the player with that socket
    players.splice( players.indexOf(player), 1 );
  });
});


http.listen(3000, function(){
  console.log('listening on *:3000');
});