class Tournament{

  String? name;
  int? noOfTeams;
  int? noOfGroups;
  int? teamsToElim;
  var teamsList = [];

  Tournament(this.name, this.noOfTeams, this.noOfGroups, this.teamsToElim, this.teamsList);

  int findNoOfGroups(int teams){
    int quotient = (teams/6).floor();
    int groups = quotient+1;

    if ((teams+quotient)%6 <= quotient){
      groups++;
    }

    return groups;
  }
}
